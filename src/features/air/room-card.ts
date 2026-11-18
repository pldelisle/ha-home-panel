// <hp-air-room>: one purifier's card in the Air detail: the room and its state, seven tiles that open their reading's history, and the Automagic or Manual control with the fan's stepper.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `RoomDetail`; a tap holds the value it asks for in the panel's overlay
// store and runs the feature's command (ADR 0023); the stepper's taps go through `debounce(900)`, so a burst is one `fan.set_percentage`.
// A send still waiting is cancelled in `disconnectedCallback` and its speed released, as Media's pods do; connecting arms nothing.
// A tile is a button: a tap asks the shell for the history's sheet (`air.history`, `{metric, room}`), which the pane draws.
// Must not: read an entity or the store's state (the detail hands it `room`), word a string, send a speed per tap, or draw the history (the pane does).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {K, MAX_PCT, MIN_PCT, PCT_STEP, setMode, setSpeed, type Mode} from './commands.ts';
import type {HistoryRequest, Metric} from './history.ts';
import {toneClass, type RoomControl, type RoomDetail} from './model.ts';
import roomOwn from './room-card.element.css?inline';
import {HISTORY_SHEET} from './sheets.ts';
import {debounce} from '../../core/timing.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {lens} from '../../ui/lens.ts';
import '../../ui/seg.ts'; // defines <hp-seg>
import type {SegChangeDetail, SegOption} from '../../ui/seg.ts';
import '../../ui/stepper.ts'; // defines <hp-stepper>
import type {StepDetail} from '../../ui/stepper.ts';
import {tile as kitTile} from '../../ui/tile.ts';
import {common, status, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** How long the stepper waits for the taps to stop before it sends the speed: the legacy `airControl`'s 900 ms. */
const SPEED_DEBOUNCE_MS = 900;

/** The control of a purifier that answers: the offline one has no radios and no stepper. */
type OnlineControl = Extract<RoomControl, {offline: false}>;

export class AirRoom extends LitElement {
  static override properties = {
    room: {attribute: false},
  };
  /** The room as the pane's model says it, held values included. */
  declare room: RoomDetail | undefined;

  // The element's own rules, its card and what only its tree has, are in room-card.element.css.
  static override styles = [common, status, tiles, unsafeCSS(forShadow(roomOwn))];

  // the catalog for the runner's toasts, and no entity: `ids` is empty, so no state change reaches the card
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  // one wait per card: the last speed of a burst is the one sent, for the room it was tapped in
  private readonly sendSpeed = debounce((fan: string, name: string, pct: number) => {
    this.waiting = undefined;
    void this.commands.run(setSpeed(fan, pct, name));
  }, SPEED_DEBOUNCE_MS);
  /** The purifier whose speed waits to be sent; its hold is released if the card leaves the document first. */
  private waiting: string | undefined;

  constructor() {
    super();
    this.room = undefined;
    // `glass` and `compact` come from the shell as host attributes the card's rules test
    new AppearanceConsumer(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.sendSpeed.cancel();
    if (this.waiting) this.optimistic.release(K.pct(this.waiting));
    this.waiting = undefined;
  }

  // the card is an inner element: the glass's lens is looked up from the root the rule's element is in, and a host is in the detail's
  protected override render() {
    const {room} = this;
    if (!room) return nothing;
    return html`<div class=${`aqcard lv${room.tone}`}>
        <div class="aqhead">
          <div>
            <h3>${room.name}</h3>
            <p>${room.headline}</p>
          </div>
          <span class=${`status ${toneClass(room.tone)}`}><i aria-hidden="true"></i>${room.state}</span>
        </div>
        <div class="tiles aqt">
          ${repeat(
            room.tiles,
            tile => tile.metric,
            tile =>
              kitTile(
                html`<div class="k">${tile.label}</div>
                  <div class="v num">${tile.value}<small>${tile.unit}</small></div>`,
                {
                  leads: {description: tile.opens, onTap: () => this.openHistory(room, tile.metric)},
                  classes: {hi: tile.high},
                },
              ),
          )}
        </div>
        ${this.renderControl(room, room.control)}
      </div>
      ${lens}`;
  }

  private renderControl(room: RoomDetail, control: RoomControl) {
    // `=== true`, not a truth test: the legacy panel's type check (tsconfig.legacy.json, `strict: false`) reaches this file through
    // `main.js`'s imports, and without `strictNullChecks` only an equality on the discriminant narrows the union
    if (control.offline === true) return html`<p class="muted">${control.message}</p>`;
    return html`<div class="aqctl">
      <hp-seg
        .label=${control.modeLabel}
        .options=${control.modes.map(({mode, label}): SegOption<Mode> => ({value: mode, label}))}
        .value=${control.modes.find(({checked}) => checked)?.mode}
        @change=${(e: CustomEvent<SegChangeDetail<Mode>>) => this.onMode(room, e.detail.value)}
      ></hp-seg>
      ${this.renderSpeed(room, control)}
    </div>`;
  }

  private renderSpeed(room: RoomDetail, {speed, hint}: OnlineControl) {
    if (!speed) return html`<p class="hint">${hint}</p>`;
    return html`<hp-stepper
      aria-label=${speed.label}
      .value=${speed.pct}
      .min=${MIN_PCT}
      .max=${MAX_PCT}
      .step=${PCT_STEP}
      .valueText=${speed.text}
      .label=${speed.caption}
      .decrementLabel=${speed.downLabel}
      .incrementLabel=${speed.upLabel}
      @step-change=${(e: CustomEvent<StepDetail>) => this.onStep(room, e.detail.value)}
    ></hp-stepper>`;
  }

  // a tile asks for its reading's history: the shell opens the sheet, and the pane draws it
  private openHistory(room: RoomDetail, metric: Metric): void {
    this.dispatchEvent(new SheetRequestEvent(HISTORY_SHEET, {metric, room: room.id} satisfies HistoryRequest));
  }

  // the mode shows at once (the hold draws the pane again) and is sent at once
  private onMode(room: RoomDetail, mode: Mode): void {
    this.optimistic.hold(K.mode(room.id), mode);
    void this.commands.run(setMode(room.id, mode, room.name));
  }

  // each tap shows at once and the last speed of a burst is sent once the taps stop; the command holds the same value again, which is harmless
  private onStep(room: RoomDetail, pct: number): void {
    this.optimistic.hold(K.pct(room.id), pct);
    this.waiting = room.id;
    this.sendSpeed(room.id, room.name, pct);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-room': AirRoom;
  }
}

if (!customElements.get('hp-air-room')) customElements.define('hp-air-room', AirRoom);
