// <hp-lights-pane>: the Lights tab: the header with its line and, for an admin, Arrange and Reset order; the Adaptive Lighting card;
// then the rooms as tiles, a linked pair side by side, in rows on a tablet (with All off) and two to a row on a phone.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `lightsModel` runs in `willUpdate` and the template places
// what it returns, keyed by room (Lit docs, repeat); a store controller on `lightIds` paused off screen (ADR 0012); the house's saved
// order and links through `SystemDataController`; the commands as data run by the kit's `CommandRunner` (ADR 0023) (README: until #262, #263).
// Must not: call the API but through its controllers, read an entity itself (`readLights` does), or hold a string the household reads.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {styleMap} from 'lit/directives/style-map.js';
import {allOff, link, pairOf, toggleArea} from './commands.ts';
import {lightIds} from './ids.ts';
import {readLights, type LightsInputs, type LightTile as Room} from './inputs.ts';
import {lightsModel, type LightsViewModel, type TileView} from './model.ts';
import type {AreaToggleEvent} from './light-tile.ts';
import './al-strip.ts'; // defines <hp-al-strip>
import './light-tile.ts'; // defines <hp-light-tile>
import paneOwn from './lights-pane.element.css?inline';
import {rejectionReason, type PanelApi} from '../../core/api.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {registriesOf} from '../../core/registry.ts';
import {sunTimes} from '../../core/sun.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {apiContext} from '../../ui/contexts.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SystemDataController} from '../../ui/controllers/system-data.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import {ToastEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The frontend system data's key that holds the order and the links, for every screen of the house. */
const SYSTEM_DATA_KEY = 'home_panel';
/** The now mark moves each minute. */
const TICK_MS = 60_000;

/** One block of the rows: a room, or a linked pair, under its first tile's key; what Arrange moves. */
interface Unit {
  key: string;
  tiles: TileView[];
}

/** A drag in progress: the unit lifted, the pointer, where it took the unit, and the units' order as it stands. */
interface Drag {
  key: string;
  pointer: number;
  dx: number;
  dy: number;
  order: string[];
  /** Released: the units settle for a moment before the saved order takes over, and the pointer moves nothing meanwhile. */
  dropped?: boolean;
}

const unitsOf = (tiles: TileView[]): Unit[] =>
  tiles.flatMap((tile, i): Unit[] =>
    tile.pair === 'second' ? [] : [{key: tile.key, tiles: tile.pair === 'first' ? [tile, tiles[i + 1]] : [tile]}],
  );

export class LightsPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    editing: {type: Boolean, reflect: true},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;
  /** Arrange is on: the tiles jiggle, a drag or an arrow key moves one, and taps neither switch nor open. */
  declare editing: boolean;

  // The element's own rules, its `:host` and what only its tree has, are in lights-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => lightIds(store)});
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
  private drag: Drag | null = null;

  constructor() {
    super();
    this.active = false;
    this.editing = false;
    new TickController(this, TICK_MS, () => this.active);
  }

  /** The rooms as the legacy room sheet reads them, until #262 moves the sheet here: the saved links and order applied. */
  rooms(): Room[] {
    return this.read()?.tiles ?? [];
  }

  /**
   * The legacy room sheet's "Link with" (until #262): the pairs are saved for every screen and said once Home Assistant accepts them, and
   * a new partner's lights are set at once, as the legacy panel did, whether or not the save is accepted. Settles once Home Assistant has
   * answered the save, so the sheet can be drawn again; it never rejects.
   */
  link(key: string, partnerKey: string): Promise<void> {
    const rooms = this.rooms();
    const tile = rooms.find(room => room.key === key);
    const change = tile && link(tile, partnerKey, rooms);
    if (!change) return Promise.resolve();
    // the save goes out first and the copy right after it, without waiting for the answer, as the legacy panel sent them
    const saved = this.save({light_links: change.pairs}, change.toast, 'lights.linkNotSaved');
    void this.commands.runAll(change.commands);
    return saved;
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
      ${compact ? this.renderTiles(view) : this.renderRows(view)}${lensLike(this.getRootNode())}`;
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
    let units = unitsOf(view.tiles);
    const order = this.drag?.order;
    // mid-drag the units follow the drag's order; one that appeared meanwhile goes last
    if (order)
      units = [
        ...order.map(key => units.find(u => u.key === key)).filter((u): u is Unit => !!u),
        ...units.filter(u => !order.includes(u.key)),
      ];
    return html`<div
      class=${kind}
      id=${kind === 'ltiles' ? 'ltiles' : nothing}
      @area-toggle=${this.onToggle}
      @pointerdown=${this.onDown}
      @pointermove=${this.onMove}
      @pointerup=${this.onDrop}
      @pointercancel=${this.onDrop}
      @keydown=${this.onKey}
    >
      ${repeat(
        units,
        unit => unit.key,
        unit => this.renderUnit(unit),
      )}
    </div>`;
  }

  private renderUnit({key, tiles}: Unit) {
    const lifted = this.drag?.key === key && !this.drag.dropped ? 'lifted' : '';
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

  /** Saves the units' order when it differs from the one drawn before the move. */
  private saveOrder(order: string[]): void {
    const before = unitsOf(this.view?.tiles ?? []).map(u => u.key);
    if (JSON.stringify(order) !== JSON.stringify(before))
      void this.save({light_order: order}, 'lights.orderSaved', 'lights.orderNotSaved');
  }

  // ---- Arrange: a unit follows the pointer, the one under it gives way, and the order is saved on release ----

  /** The unit a pointer or a key is on: the child of the rows that holds it. */
  private unitOf(e: Event): HTMLElement | undefined {
    return e
      .composedPath()
      .find(
        (n): n is HTMLElement =>
          n instanceof HTMLElement && n.dataset.unit !== undefined && n.parentElement === e.currentTarget,
      );
  }

  private unitEl(key: string): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`[data-unit="${CSS.escape(key)}"]`);
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.editing || e.button > 0) return;
    const unit = this.unitOf(e);
    if (!unit) return;
    e.preventDefault();
    const box = unit.getBoundingClientRect();
    const order = unitsOf(this.view?.tiles ?? []).map(u => u.key);
    this.drag = {
      key: unit.dataset.unit!,
      pointer: e.pointerId,
      dx: e.clientX - box.left,
      dy: e.clientY - box.top,
      order,
    };
    try {
      unit.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is already gone: the drop follows
    }
    this.requestUpdate();
  };

  private readonly onMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.dropped || !this.editing || e.pointerId !== drag.pointer) return;
    e.preventDefault();
    // the unit under the pointer takes the lifted one's place (the lifted one lets the pointer through)
    const over = (this.renderRoot as ShadowRoot)
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-unit]');
    const target = over?.dataset.unit;
    if (target && target !== drag.key) {
      const order = drag.order.filter(key => key !== drag.key);
      order.splice(drag.order.indexOf(target), 0, drag.key);
      drag.order = order;
      this.requestUpdate();
      void this.updateComplete.then(() => this.follow(e));
    } else this.follow(e);
    // near the top or the bottom of the screen the page scrolls along
    if (e.clientY < 70) window.scrollBy(0, -12);
    else if (e.clientY > innerHeight - 90) window.scrollBy(0, 12);
  };

  // the lifted unit stays where the pointer took it
  private follow(e: PointerEvent): void {
    const drag = this.drag;
    const unit = drag && this.unitEl(drag.key);
    if (!unit) return;
    unit.style.transform = '';
    const box = unit.getBoundingClientRect();
    unit.style.transform = `translate(${e.clientX - drag.dx - box.left}px,${e.clientY - drag.dy - box.top}px)`;
  }

  private readonly onDrop = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.dropped || e.pointerId !== drag.pointer) return;
    drag.dropped = true;
    const unit = this.unitEl(drag.key);
    if (unit) unit.style.transform = '';
    this.saveOrder(drag.order);
    this.requestUpdate(); // the unit is put down at once
    // the drop settles before the tiles follow the saved order, as the legacy drag let it
    setTimeout(() => {
      if (this.drag === drag) this.drag = null;
      this.requestUpdate();
    }, 60);
  };

  // while arranging, an arrow key moves the focused unit one place, and the order is saved
  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.editing) return;
    const step = ({ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1} as Record<string, number>)[e.key];
    const unit = this.unitOf(e);
    if (!unit || !step) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const order = unitsOf(this.view?.tiles ?? []).map(u => u.key);
    const i = order.indexOf(unit.dataset.unit!);
    const j = i + step;
    if (j < 0 || j >= order.length) return;
    order.splice(j, 0, ...order.splice(i, 1));
    const focused = e.composedPath()[0] as HTMLElement;
    this.saveOrder(order);
    void this.updateComplete.then(() => focused.focus());
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-lights-pane': LightsPane;
  }
}

if (!customElements.get('hp-lights-pane')) customElements.define('hp-lights-pane', LightsPane);
