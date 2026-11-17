// <hp-lights-pane>: the Lights tab: the header with its line and, for an admin, Arrange and Reset order; the Adaptive Lighting card;
// then the rooms as tiles, a linked pair side by side, in rows on a tablet (with All off) and two to a row on a phone; a room's sheet.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over view models: `lightsModel` and `sheetModel` run in `willUpdate`, keyed by
// room (Lit docs, repeat); a store controller on `lightIds` paused off screen (ADR 0012) and held under a slider's finger; Arrange by the
// kit's `DragReorderController`; the order and links through `SystemDataController`; the commands run by the kit's `CommandRunner` (ADR 0023).
// Must not: call the API but through its controllers, read an entity itself (`readLights` does), or hold a string the household reads.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import {styleMap} from 'lit/directives/style-map.js';
import {
  allOff,
  isAuto,
  isNight,
  link,
  pairOf,
  setAuto,
  setBrightness,
  setColorTemp,
  setNight,
  toggleArea,
  toggleOne,
  type LightServices,
} from './commands.ts';
import {lightIds} from './ids.ts';
import {readLights, type LightsInputs, type LightTile as Room} from './inputs.ts';
import {lightsModel, sheetModel, type LightsViewModel, type SheetView, type TileView} from './model.ts';
import type {AreaToggleEvent} from './light-tile.ts';
import type {SheetIntentEvent, SliderWords} from './light-sheet.ts';
import type {SliderChangeEvent} from './light-slider.ts';
import type {LinkPickEvent} from './link-picker.ts';
import {ROOM_SHEET} from './sheets.ts';
import './light-sheet.ts'; // defines <hp-light-sheet>
import './al-strip.ts'; // defines <hp-al-strip>
import './light-tile.ts'; // defines <hp-light-tile>
import paneOwn from './lights-pane.element.css?inline';
import {rejectionReason, type PanelApi} from '../../core/api.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {registriesOf} from '../../core/registry.ts';
import {sunTimes} from '../../core/sun.ts';
import {hasManualControlService} from '../../providers/adaptive-lighting.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {DragReorderController} from '../../ui/controllers/drag-reorder.ts';
import {apiContext} from '../../ui/contexts.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SystemDataController} from '../../ui/controllers/system-data.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import {SheetDismissEvent, ToastEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The frontend system data's key that holds the order and the links, for every screen of the house. */
const SYSTEM_DATA_KEY = 'home_panel';
/** The now mark moves each minute. */
const TICK_MS = 60_000;
/** After a slider's release the pills settle this long before the house's state draws them again, as the legacy sheet let them. */
const SETTLE_MS = 60;

/** One block of the rows: a room, or a linked pair, under its first tile's key; what Arrange moves. */
interface Unit {
  key: string;
  tiles: TileView[];
}

const unitsOf = (tiles: TileView[]): Unit[] =>
  tiles.flatMap((tile, i): Unit[] =>
    tile.pair === 'second' ? [] : [{key: tile.key, tiles: tile.pair === 'first' ? [tile, tiles[i + 1]] : [tile]}],
  );

export class LightsPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    editing: {type: Boolean, reflect: true},
    roomKey: {},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;
  /** Arrange is on: the tiles jiggle, a drag or an arrow key moves one, and taps neither switch nor open. */
  declare editing: boolean;
  /** The room whose sheet is open, bound by the descriptor from the sheet host's detail; undefined while none is. */
  declare roomKey: string | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in lights-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  // held while a finger is on a slider: a change of the house then waits for the release, so the pill stays under the finger
  private readonly storeController = new StoreController(this, {
    ids: store => lightIds(store),
    held: () => this.sliding,
  });
  private readonly appearance = new AppearanceConsumer(this);
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  private api: PanelApi | undefined;
  // the api arrives with the connection; the system data is read once the pane has both
  private readonly apiConsumer = new ContextConsumer(this, {
    context: apiContext,
    subscribe: false,
    callback: api => {
      this.api = api;
    },
  });
  private readonly systemData = new SystemDataController(
    this,
    () => (this.api ? {api: this.api, store: this.storeController.store} : null),
    SYSTEM_DATA_KEY,
  );
  private inputs: LightsInputs | undefined;
  private view: LightsViewModel | undefined;
  private sheet: SheetView | null = null;
  // Arrange: a unit follows the pointer, the one under it gives way, an arrow key moves the focused one, and the order is saved
  private readonly arrange = new DragReorderController(this, {
    enabled: () => this.editing,
    keys: () => unitsOf(this.view?.tiles ?? []).map(u => u.key),
    keyOf: unit => unit.dataset.unit,
    onReorder: keys => void this.save({light_order: keys}, 'lights.orderSaved', 'lights.orderNotSaved'),
  });
  /** A finger is on a slider of the sheet, or it was released less than `SETTLE_MS` ago. */
  private sliding = false;
  private settle: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this.active = false;
    this.editing = false;
    this.roomKey = undefined;
    new TickController(this, TICK_MS, () => this.active);
  }

  /**
   * "Link with": the pairs are saved for every screen and said once Home Assistant accepts them, and a new partner's lights are set at
   * once, as the legacy panel did, whether or not the save is accepted.
   */
  private link(key: string, partnerKey: string): void {
    const rooms = this.read()?.tiles ?? [];
    const tile = rooms.find(room => room.key === key);
    const change = tile && link(tile, partnerKey, rooms);
    if (!change) return;
    // the save goes out first and the copy right after it, without waiting for the answer, as the legacy panel sent them
    void this.save({light_links: change.pairs}, change.toast, 'lights.linkNotSaved');
    void this.commands.runAll(change.commands);
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active')) {
      if (this.active) this.storeController.resume();
      else {
        this.storeController.pause();
        this.editing = false; // another tab ends Arrange, as the legacy panel did
      }
    }
    // a sheet closed under the finger (Escape, the scrim, a room gone) says no `drag-end`: the hold ends with it
    if (changed.has('roomKey') && !this.roomKey && this.sliding) {
      clearTimeout(this.settle);
      this.sliding = false;
      this.storeController.release();
    }
    if (!this.active) return;
    const inputs = this.read();
    if (!inputs) return;
    const {store} = this.storeController;
    const {hass, fmt} = store;
    const now = Date.now();
    const sun = sunTimes(hass!.config.latitude ?? 0, hass!.config.longitude ?? 0, fmt.isoDay(now));
    this.inputs = inputs;
    this.view = lightsModel(inputs, {
      t: store.t,
      fmt,
      now,
      sun,
      compact: this.appearance.value?.compact === true,
      editing: this.editing,
      isAdmin: store.isAdmin,
    });
    this.sheet = this.roomKey ? sheetModel(this.roomKey, inputs, {t: store.t, isAdmin: store.isAdmin}) : null;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.settle);
    this.sliding = false;
  }

  // a room Home Assistant no longer lists has no sheet to show: the host is asked to close it
  protected override updated(): void {
    if (this.roomKey && this.view && !this.sheet) this.dispatchEvent(new SheetDismissEvent(ROOM_SHEET));
  }

  private read(): LightsInputs | undefined {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return undefined;
    return readLights(hass.states, registriesOf(hass), store.names, store.config, this.systemData.value);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    const {arrange} = view;
    const compact = this.appearance.value?.compact === true;
    return html`<hp-pane-header .icon=${'bulb'} .color=${'var(--warn)'} .heading=${t('lights.title')}>
        <div slot="sub">${view.summary}</div>
        <div class="ledbar" id="ledbar" slot="actions" ?hidden=${!arrange.show}>
          <button type="button" class="lbtn" id="lreset" ?hidden=${!arrange.canReset} @click=${this.onReset}>
            ${arrange.resetLabel}</button
          ><button
            type="button"
            class="lbtn"
            id="ledit"
            aria-pressed=${arrange.editing ? 'true' : 'false'}
            @click=${this.onArrange}
          >
            ${arrange.label}
          </button>
        </div>
      </hp-pane-header>
      ${view.strip ? html`<hp-al-strip .strip=${view.strip}></hp-al-strip>` : nothing}
      ${compact ? this.renderTiles(view) : this.renderRows(view)}${this.renderSheet()}${lensLike(this.getRootNode())}`;
  }

  // the room's sheet, over the page while it is open; what it asks comes back here
  private renderSheet() {
    if (!this.sheet) return nothing;
    const {t} = this.storeController.store;
    const words: SliderWords = {
      br: v => (v ? t('lights.percent', {n: String(v)}) : t('lights.off')),
      ct: k => t('lights.kelvin', {k: String(k)}),
    };
    return html`<hp-light-sheet
      .view=${this.sheet}
      .words=${words}
      .doneLabel=${t('lights.done')}
      @area-toggle=${this.onToggle}
      @slider-change=${this.onSlider}
      @sheet-intent=${this.onIntent}
      @link-pick=${this.onLinkPick}
      @drag-start=${this.onSlideStart}
      @drag-end=${this.onSlideEnd}
    ></hp-light-sheet>`;
  }

  // the tablet's card: its line and All off, then the rows
  private renderRows(view: LightsViewModel) {
    const {card, allOff: off} = view;
    return html`<div class="lcard" id="lights">
      <div class="top">
        <span class="lbl">${card.title}</span
        ><span class="right"
          >${card.right}${
            off.show
              ? html`<button type="button" class="lbtn" data-l="alloff" @click=${this.onAllOff}>${off.label}</button>`
              : nothing
          }</span
        >
      </div>
      ${card.empty ? nothing : this.renderUnits(view, 'lrows')}
    </div>`;
  }

  // the phone's grid, or its hint when the house has no light
  private renderTiles(view: LightsViewModel) {
    return view.emptyHint
      ? html`<div class="ltiles" id="ltiles"><p class="hint">${view.emptyHint}</p></div>`
      : this.renderUnits(view, 'ltiles');
  }

  private renderUnits(view: LightsViewModel, kind: 'lrows' | 'ltiles') {
    // mid-drag the units follow the drag's order
    const units = this.arrange.arrange(unitsOf(view.tiles), unit => unit.key);
    const {arrange} = this;
    return html`<div
      class=${kind}
      id=${ifDefined(kind === 'ltiles' ? 'ltiles' : undefined)}
      @area-toggle=${this.onToggle}
      @pointerdown=${arrange.onPointerDown}
      @pointermove=${arrange.onPointerMove}
      @pointerup=${arrange.onPointerUp}
      @pointercancel=${arrange.onPointerUp}
      @keydown=${arrange.onKeyDown}
      @click=${arrange.onClickCapture}
    >
      ${repeat(
        units,
        unit => unit.key,
        unit => this.renderUnit(unit),
      )}
    </div>`;
  }

  private renderUnit({key, tiles}: Unit) {
    const lifted = this.arrange.lifted === key ? 'lifted' : '';
    const tile = (t: TileView) => html`<hp-light-tile .tile=${t} .editing=${this.editing}></hp-light-tile>`;
    if (tiles.length === 1)
      return html`<hp-light-tile
        class=${lifted}
        data-unit=${key}
        .tile=${tiles[0]}
        .editing=${this.editing}
      ></hp-light-tile>`;
    return html`<div
      class="llink on ${lifted}"
      data-unit=${key}
      style=${styleMap({'--lc': tiles[0].pairTint || undefined})}
    >
      ${tile(tiles[0])}${tile(tiles[1])}
    </div>`;
  }

  // ---- what a tap asks ----

  private readonly onToggle = (e: AreaToggleEvent): void => {
    e.stopPropagation();
    const rooms = this.inputs?.tiles ?? [];
    const room = rooms.find(r => r.key === e.detail.key);
    if (room) void this.commands.runAll(toggleArea(pairOf(room, rooms)));
  };

  /** The sheet's room and its partner, which act as one room; empty when the room is gone. */
  private sheetPair(): Room[] {
    // the house as it is now, not as the last draw read it: a release follows a hold that drew nothing
    const rooms = this.read()?.tiles ?? [];
    const room = rooms.find(r => r.key === this.roomKey);
    return room ? pairOf(room, rooms) : [];
  }

  private services(): LightServices {
    return {manualControl: hasManualControlService(this.storeController.store.hass?.services)};
  }

  // a release or an arrow key: the level by hand, which takes the room off Auto
  private readonly onSlider = (e: SliderChangeEvent): void => {
    e.stopPropagation();
    const pair = this.sheetPair();
    if (!pair.length) return;
    const {kind, value} = e.detail;
    const set = kind === 'br' ? setBrightness : setColorTemp;
    void this.commands.runAll(set(pair, value, this.services()));
  };

  // Auto or Night the other way from what the pair is in, or one bulb switched
  private readonly onIntent = (e: SheetIntentEvent): void => {
    e.stopPropagation();
    const intent = e.detail;
    if (intent.kind === 'bulb') {
      void this.commands.runAll(toggleOne(intent.id));
      return;
    }
    const pair = this.sheetPair();
    if (!pair.length) return;
    const commands =
      intent.kind === 'auto'
        ? setAuto(pair, !isAuto(pair), this.services())
        : setNight(pair, !isNight(pair[0]), this.services());
    void this.commands.runAll(commands);
  };

  private readonly onLinkPick = (e: LinkPickEvent): void => {
    e.stopPropagation();
    if (this.roomKey) this.link(this.roomKey, e.detail.key);
  };

  private readonly onSlideStart = (): void => {
    clearTimeout(this.settle);
    this.sliding = true;
  };

  // the pills settle a moment, then the sheet is drawn again from the house, in one update, as the legacy sheet's tick drew it: what
  // came meanwhile, or the state as it was when the call was refused or changed nothing
  private readonly onSlideEnd = (): void => {
    clearTimeout(this.settle);
    this.settle = setTimeout(() => {
      this.sliding = false;
      this.storeController.release();
      this.requestUpdate();
    }, SETTLE_MS);
  };

  private readonly onAllOff = (): void => {
    void this.commands.runAll(allOff(this.inputs?.tiles ?? []));
  };

  private readonly onArrange = (): void => {
    this.editing = !this.editing;
  };

  private readonly onReset = (): void => {
    void this.save({light_order: null}, 'lights.orderReset', 'lights.orderNotSaved');
  };

  /** Writes the system data, then says `done`; a refusal puts the old value back and says why, until dismissed. Never rejects. */
  private save(
    patch: {light_order?: string[] | null; light_links?: string[][]},
    done: MessageKey,
    failed: MessageKey,
  ): Promise<void> {
    const {t} = this.storeController.store;
    return this.systemData.set(patch).then(
      () => void this.dispatchEvent(new ToastEvent(t(done))),
      (e: unknown) => void this.dispatchEvent(new ToastEvent(t(failed, {reason: rejectionReason(e)}), true)),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-lights-pane': LightsPane;
  }
}

if (!customElements.get('hp-lights-pane')) customElements.define('hp-lights-pane', LightsPane);
