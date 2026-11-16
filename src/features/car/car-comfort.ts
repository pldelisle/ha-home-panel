// <hp-car-comfort>: the Car detail's comfort and access card: remote start and the three heaters, the seat line, the lock and the horn, and the departure schedule (its switch, seven days, time and cabin setting, and "Save schedule").
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `comfortControls`, the model's pure view; the schedule's draft is its state, edited locally, validated and sent once (a form draft: Fowler's Unit of Work in miniature),
// created when the card is drawn and begun again when Ford's saved schedule changes (the cabin choice kept: Ford does not report it). A tap holds the value it asks for in the panel's overlay and runs a `Command` through `CommandRunner` (ADR 0023); remote start and unlock wait for a second tap in `ArmedController`.
// Must not: read an entity or the clock (the inputs and the model did), build a command by hand (commands.ts does), send a draft that `validate` refuses, or keep the draft anywhere else (the store never sees it).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {repeat} from 'lit/directives/repeat.js';
import ownCss from './car-comfort.element.css?inline';
import {honk, lockCar, remoteStart, saveSchedule, toggleDeparture, toggleHeater, unlockCar} from './commands.ts';
import {comfortControls, type ArmedKey, type ComfortButtonView, type ComfortView} from './controls.ts';
import controlsCss from './controls.css?inline';
import type {CarFeatureInputs} from './inputs.ts';
import {
  redraft,
  scheduleKey,
  toggleDay,
  validate,
  withFiveMinutes,
  type CabinTemperature,
  type ScheduleDraft,
} from './schedule.ts';
import blockCss from './styles.css?inline';
import type {Command} from '../../core/commands.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {ArmedController} from '../../ui/controllers/armed.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {ToastEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {lensLike} from '../../ui/lens.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import '../../ui/seg.ts'; // defines <hp-seg>
import type {SegChangeDetail} from '../../ui/seg.ts';
import {button, common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import type {SwitchChangeDetail} from '../../ui/switch.ts';
import '../../ui/switch-row.ts'; // defines <hp-switch-row>

export class CarComfort extends LitElement {
  static override properties = {inputs: {attribute: false}};
  /** What the pane read: the car, the charger and the car's entities. */
  declare inputs: CarFeatureInputs | undefined;

  // the kit's inner card and pill button, the blocks' shared rules and the controls' labels (styles.css, controls.css); the card's own rules are in car-comfort.element.css
  static override styles = [
    common,
    inner,
    button,
    unsafeCSS(forShadow(blockCss)),
    unsafeCSS(forShadow(controlsCss)),
    unsafeCSS(forShadow(ownCss)),
  ];

  // the catalog and the formatters; no entity, so no state change reaches the card but through the pane's `inputs`
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  private readonly armed = new ArmedController(this);
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  // The departure schedule's draft: what the person edited and has not sent. It is begun from Ford's saved schedule when the card is drawn and again when that schedule changes, which is `savedKey`.
  private draft: ScheduleDraft | null = null;
  private savedKey: string | undefined;
  private view: ComfortView | null = null;

  constructor() {
    super();
    this.inputs = undefined;
    // `glass` and `compact` come from the shell as host attributes the card's rules test
    new AppearanceConsumer(this);
  }

  // a card that leaves the document draws its draft again from Ford's schedule when it comes back, as the legacy panel's did when the detail opened
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.draft = null;
  }

  protected override willUpdate(): void {
    const {inputs} = this;
    if (!inputs) {
      this.view = null;
      return;
    }
    const saved = inputs.car?.schedule ?? null;
    const key = scheduleKey(saved);
    if (!this.draft || key !== this.savedKey) {
      this.draft = redraft(this.draft, saved);
      this.savedKey = key;
    }
    const {t, fmt} = this.storeController.store;
    this.view = comfortControls(inputs, (armed: ArmedKey) => this.armed.isArmed(armed), this.draft, {
      t,
      fmt,
      overlay: this.overlay,
    });
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const {access, departure} = view;
    const horn = access.honk;
    return html`<div class="inner fill">
        <h3>${view.title}</h3>
        <p>${view.line}</p>
        <div class="ctls">
          ${repeat(
            view.buttons,
            ({key}) => key,
            b => this.renderButton(view, b),
          )}
        </div>
        ${view.seats ? html`<div class="hint">${view.seats}</div>` : nothing}
        <div class="access">
          <div class="tx"><b>${access.title}</b><span>${access.line}</span></div>
          ${
            horn
              ? html`<button type="button" class="abtn" @click=${() => this.ask(honk({id: horn.id}))}>
                  ${horn.label}
                </button>`
              : nothing
          }
          <button
            type="button"
            class=${classMap({abtn: true, armed: access.lock.armed})}
            ?disabled=${access.lock.disabled}
            @click=${() => this.onLock(view)}
          >
            ${access.lock.label}
          </button>
        </div>
        <div class="ctl-l dep">${departure.heading}</div>
        <hp-switch-row
          .heading=${departure.row.title}
          .line=${departure.row.line}
          .checked=${departure.row.on}
          .disabled=${departure.row.disabled}
          .label=${departure.row.label}
          @change=${(e: CustomEvent<SwitchChangeDetail>) => this.ask(toggleDeparture(view.car, e.detail.checked), e.detail.checked)}
        ></hp-switch-row>
        <div class="deprow">
          <div class="days" role="group" aria-label=${departure.daysLabel}>
            ${repeat(
              departure.days,
              ({day}) => day,
              ({day, name, initial, pressed}) =>
                html`<button
                  type="button"
                  aria-pressed=${pressed ? 'true' : 'false'}
                  aria-label=${name}
                  @click=${() => this.edit(draft => toggleDay(draft, day))}
                >
                  ${initial}
                </button>`,
            )}
          </div>
          <input
            class="dtime"
            type="time"
            step="300"
            .value=${departure.time}
            aria-label=${departure.timeLabel}
            @change=${(e: Event) => this.edit(draft => ({...draft, time: (e.target as HTMLInputElement).value}))}
          />
        </div>
        <hp-seg
          .label=${departure.cabinLabel}
          .options=${departure.cabin}
          .value=${departure.chosen}
          @change=${(e: CustomEvent<SegChangeDetail>) =>
            this.edit(draft => ({...draft, temp: e.detail.value as CabinTemperature}))}
        ></hp-seg>
        <div class="hint">${departure.hint}</div>
        <button type="button" class="save" @click=${this.save}>${departure.save}</button>
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  private renderButton(view: ComfortView, b: ComfortButtonView) {
    return html`<button
      type="button"
      class=${classMap({cbtn: true, armed: b.armed})}
      aria-pressed=${b.pressed ? 'true' : 'false'}
      ?disabled=${b.disabled}
      @click=${() => (b.key === 'remoteStart' ? this.onRemoteStart(view, b) : this.onHeater(view, b))}
    >
      <span class="ic">${ico(b.icon, 18)}</span>
      <div><b>${b.text}</b><br /><span>${b.line}</span></div>
    </button>`;
  }

  // Remote start and unlock need a second tap, so a stray touch on a wall panel does nothing; stopping a car that runs does not
  private onRemoteStart({car}: ComfortView, {pressed}: ComfortButtonView): void {
    if (!pressed && !this.armed.confirm('remoteStart')) {
      this.armed.clear();
      this.armed.arm('remoteStart');
      return;
    }
    this.armed.clear();
    this.ask(remoteStart(car, !pressed), !pressed);
  }

  private onHeater({car}: ComfortView, {key, name, pressed}: ComfortButtonView): void {
    if (key !== 'remoteStart') this.ask(toggleHeater(car, key, !pressed, name), !pressed);
  }

  private onLock({car, access}: ComfortView): void {
    const {locked} = access.lock;
    if (locked && !this.armed.confirm('lock')) {
      this.armed.clear();
      this.armed.arm('lock');
      return;
    }
    this.armed.clear();
    this.ask(locked ? unlockCar(car) : lockCar(car), !locked);
  }

  // an edit of the draft: a new value, and the card draws it
  private edit(change: (draft: ScheduleDraft) => ScheduleDraft): void {
    if (this.draft) this.draft = change(this.draft);
    this.requestUpdate();
  }

  // Validate, then send once: what is missing is a toast and nothing is sent; the time is rounded to Ford's five-minute steps and the field says what was sent.
  private readonly save = (): void => {
    const {draft} = this;
    if (!draft) return;
    const {t, fmt} = this.storeController.store;
    const problem = validate(draft);
    if (problem) {
      this.dispatchEvent(new ToastEvent(t(problem)));
      return;
    }
    const sent = withFiveMinutes(draft);
    this.draft = sent;
    this.requestUpdate();
    void this.commands.run(saveSchedule(sent, {fmt, t}));
  };

  // what a tap asks for shows at once (the overlay holds it, and the card draws again) and the command is sent
  private ask(command: Command, held?: unknown): void {
    void this.commands.runHolding(command, held);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-comfort': CarComfort;
  }
}

if (!customElements.get('hp-car-comfort')) customElements.define('hp-car-comfort', CarComfort);
