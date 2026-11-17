// <hp-climate-controls>: what a person sets in the Climate detail: the heat pump's mode, target, fan, preset and louvers; the house's "set every room" with its two buttons, which ask in a dialog before they change every room; a room's setpoint and quick buttons.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `ControlsView`: it switches on `kind` and computes nothing but the next setpoint (commands.ts). A tap shows its value at once in the panel's overlay and runs a
// `Command` through the kit's `CommandRunner` (ADR 0023), through `ControlSender`: a setpoint waits 1,100 ms for the taps to stop, a mode goes now. the two questions are the kit's `<hp-dialog>` (ADR 0035), opened by `asking`;
// `<hp-seg>` and `<hp-stepper>` are the kit's controls.
// Must not: read an entity or the store's states (the view has what it needs), build a command by hand (commands.ts does), word a question (the model does), send a setpoint per tap, send "all rooms" before its dialog's button, or keep a thermostat's value (the overlay does).
import {LitElement, html, nothing, unsafeCSS, type TemplateResult} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {DASH} from '../../core/figures.ts';
import {FROST_GUARD} from '../../providers/power.ts';
import controlsOwn from './climate-controls.element.css?inline';
import {
  ALL_ROOMS,
  hpFan,
  hpMode,
  hpPreset,
  hpSwing,
  hpTemperature,
  nextSetpoint,
  quickSetpoint,
  SETPOINT_STEP,
  setAllRooms,
  setRoomTemperature,
} from './commands.ts';
import {tenthDegrees} from './items.ts';
import {ControlSender} from './sender.ts';
import type {AskView, ControlOption, ControlsView} from './model.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import '../../ui/dialog.ts'; // defines <hp-dialog>
import '../../ui/seg.ts'; // defines <hp-seg>
import type {SegChangeDetail, SegOption} from '../../ui/seg.ts';
import '../../ui/stepper.ts'; // defines <hp-stepper>
import type {StepDetail} from '../../ui/stepper.ts';
import {button, common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

type Hp = Extract<ControlsView, {kind: 'hp'; offline?: false}>;
type House = Extract<ControlsView, {kind: 'house'}>;
type Room = Extract<ControlsView, {kind: 'room'; offline?: false}>;

/** The two buttons of "all rooms": each asks first, in a dialog of its own. */
type AllKey = 'allset' | 'alloff';

const segOptions = (options: readonly ControlOption[]): SegOption[] =>
  options.map(({value, label}) => ({value, label}));
/** The word an option says its value with (the toast says it in lower case), or the value itself for one the unit offers that the options lack. */
const wordOf = (options: readonly ControlOption[], value: string): string =>
  options.find(option => option.value === value)?.label ?? value;
const chosen = (options: readonly ControlOption[]): string | undefined => options.find(({checked}) => checked)?.value;

export class ClimateControls extends LitElement {
  static override properties = {
    view: {attribute: false},
    allSetpoint: {state: true},
    asking: {state: true},
  };
  /** The model's controls for what the detail shows; the element draws it and changes nothing in it. */
  declare view: ControlsView | undefined;
  /** The "set every room" stepper's value: the element's own state, until the person moves it. */
  declare allSetpoint: number;
  /** The question on screen, if any: the dialog that is open. */
  declare private asking: AllKey | null;

  // The kit's pill button; the element's own rules, its `:host`, the labels, the lines of controls, the quick buttons and the louvers' select, are in climate-controls.element.css.
  static override styles = [common, button, unsafeCSS(forShadow(controlsOwn))];

  // the catalog and the formatters; no entity, so no state change reaches the element
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  private readonly sender = new ControlSender(this, {overlay: this.optimistic, commands: this.commands});

  constructor() {
    super();
    this.view = undefined;
    this.allSetpoint = ALL_ROOMS.start;
    this.asking = null;
  }

  /** The phone's detail has the dial, which sets a room's setpoint and the heat pump's target: their steppers are not drawn there. */
  private get compact(): boolean {
    return this.appearance.value?.compact === true;
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    switch (view.kind) {
      case 'hp':
        return view.offline === true ? html`<p>${t('climate.heatPumpOffline')}</p>` : this.renderHeatPump(view);
      case 'house':
        return this.renderHouse(view);
      case 'room':
        return view.offline === true ? html`<p>${t('climate.thermostatUnavailable')}</p>` : this.renderRoom(view);
    }
  }

  // ---- the heat pump ----

  private renderHeatPump(hp: Hp) {
    const {t, fmt} = this.storeController.store;
    const {mode, modes, target, fan, preset, swing} = hp;
    return html`<div class="clbl">${t('climate.mode')}</div>
      ${this.renderGroup(t('climate.hpModeLabel'), modes, (value, word) => this.sender.now(hpMode(hp, value, word), value))}
      ${
        target
          ? html`<div class="crow">
              ${
                this.compact
                  ? nothing
                  : html`<hp-stepper
                      aria-label=${t('climate.target')}
                      .label=${t('climate.target')}
                      .value=${target.value ?? 0}
                      .min=${target.lo}
                      .max=${target.hi}
                      .step=${SETPOINT_STEP}
                      .valueText=${target.value === null ? DASH : tenthDegrees(fmt, target.value)}
                      .decrementLabel=${t('climate.lowerTarget')}
                      .incrementLabel=${t('climate.raiseTarget')}
                      .disabled=${target.value === null}
                      @step-change=${(e: CustomEvent<StepDetail>) =>
                        this.sender.later(hpTemperature(hp, e.detail.value, fmt), e.detail.value)}
                    ></hp-stepper>`
              }
            </div>`
          : nothing
      }
      ${
        mode === 'off'
          ? nothing
          : html`${
              fan
                ? html`<div class="clbl">${t('climate.fan')}</div>
                    ${this.renderGroup(t('climate.fanSpeed'), fan, (value, word) => this.sender.now(hpFan(hp, value, word), value))}`
                : nothing
            }
            ${
              preset
                ? html`<div class="clbl">${t('climate.preset')}</div>
                    ${this.renderGroup(t('climate.preset'), preset, (value, word) =>
                      this.sender.now(hpPreset(hp, value, word), value),
                    )}`
                : nothing
            }
            ${swing ? this.renderSwing(hp, swing) : nothing}`
      }`;
  }

  // a radio group of the heat pump's: a tap says the value and the word its toast uses
  private renderGroup(
    label: string,
    options: readonly ControlOption[],
    choose: (value: string, word: string) => void,
  ): TemplateResult {
    return html`<hp-seg
      .label=${label}
      .options=${segOptions(options)}
      .value=${chosen(options)}
      @change=${(e: CustomEvent<SegChangeDetail>) => {
        const {value} = e.detail;
        choose(value, wordOf(options, value));
      }}
    ></hp-seg>`;
  }

  // the louvers: a select, as the legacy panel drew them, so a unit with many positions does not grow the controls
  private renderSwing(hp: Hp, swing: readonly ControlOption[]) {
    const {t} = this.storeController.store;
    return html`<div class="clbl">${t('climate.louvers')}</div>
      <select
        class="csel"
        aria-label=${t('climate.louverPosition')}
        @change=${(e: Event) => {
          const {value} = e.target as HTMLSelectElement;
          this.sender.now(hpSwing(hp, value, wordOf(swing, value)), value);
        }}
      >
        ${repeat(
          swing,
          ({value}) => value,
          ({value, label, checked}) => html`<option value=${value} ?selected=${checked}>${label}</option>`,
        )}
      </select>`;
  }

  // ---- the house ----

  private renderHouse({rooms, asks}: House) {
    const {t, fmt} = this.storeController.store;
    const {allSetpoint: value} = this;
    const degrees = fmt.fixed(value, 1);
    // a dialog per button: the set one's words follow the stepper's value, which cannot move while the dialog is open
    const dialog = (key: AllKey, ask: AskView) =>
      html`<hp-dialog
        data-ask=${key}
        .open=${this.asking === key}
        .heading=${ask.title}
        .line=${ask.line}
        .cancelLabel=${ask.cancel}
        .confirmLabel=${ask.confirm}
        @dialog-cancel=${this.dismiss}
        @dialog-confirm=${() => this.onConfirm(key, rooms, value)}
      ></hp-dialog>`;
    return html`<div class="clbl">${t('climate.allRooms')}</div>
      <div class="crow">
        <hp-stepper
          aria-label=${t('climate.setEveryRoomTo')}
          .label=${t('climate.setEveryRoomTo')}
          .value=${value}
          .min=${ALL_ROOMS.lo}
          .max=${ALL_ROOMS.hi}
          .step=${SETPOINT_STEP}
          .valueText=${`${degrees}°`}
          .decrementLabel=${t('climate.lowerAll')}
          .incrementLabel=${t('climate.raiseAll')}
          @step-change=${this.onAllStep}
        ></hp-stepper>
        <button type="button" class="abtn" @click=${() => (this.asking = 'allset')}>
          ${t('climate.setAllTo', {n: degrees})}
        </button>
        <button type="button" class="abtn" @click=${() => (this.asking = 'alloff')}>${t('climate.allOff')}</button>
      </div>
      <p class="chint">${t('climate.frostGuardHint')}</p>
      ${dialog('allset', asks.set(value))} ${dialog('alloff', asks.off)}`;
  }

  private readonly onAllStep = (e: CustomEvent<StepDetail>): void => {
    this.allSetpoint = e.detail.value;
  };

  private readonly dismiss = (): void => {
    this.asking = null;
  };

  // the dialog's button: one call for every room, shown at once
  private onConfirm(key: AllKey, rooms: readonly string[], value: number): void {
    this.asking = null;
    const to = key === 'alloff' ? FROST_GUARD : value;
    this.sender.now(setAllRooms(rooms, to, this.storeController.store.fmt), to);
  }

  // ---- a room ----

  private renderRoom(room: Room) {
    const {t, fmt} = this.storeController.store;
    const {setpoint, quick} = room;
    return html`<div class="crow">
      ${
        this.compact
          ? nothing
          : html`<hp-stepper
              aria-label=${t('climate.dial.setpoint')}
              .label=${t('climate.dial.setpoint')}
              .value=${setpoint.value}
              .min=${setpoint.lo}
              .max=${setpoint.hi}
              .step=${SETPOINT_STEP}
              .valueText=${setpoint.off ? t('climate.off') : tenthDegrees(fmt, setpoint.value)}
              .decrementLabel=${t('climate.lowerSetpoint')}
              .incrementLabel=${t('climate.raiseSetpoint')}
              @step-change=${(e: CustomEvent<StepDetail>) => this.onRoomStep(room, e.detail.value)}
            ></hp-stepper>`
      }
      <div class="quick">
        ${repeat(
          quick,
          ({label}) => label,
          ({value, label, pressed}) =>
            html`<button
              type="button"
              aria-pressed=${pressed ? 'true' : 'false'}
              @click=${() => this.askRoom(room, quickSetpoint(value, setpoint.lo, setpoint.hi))}
            >
              ${label}
            </button>`,
        )}
      </div>
    </div>`;
  }

  // the stepper says which way a tap went (it keeps its value between the ends by itself); `nextSetpoint` knows the frost guard
  private onRoomStep(room: Room, asked: number): void {
    const {value, lo, hi} = room.setpoint;
    this.askRoom(room, nextSetpoint(value, asked > value ? SETPOINT_STEP : -SETPOINT_STEP, lo, hi));
  }

  // shown now, sent once the taps stop: five taps on `+` are one call at the last value
  private askRoom(room: Room, value: number): void {
    const command = setRoomTemperature(room, value, this.storeController.store.fmt);
    this.sender.later(command, value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-climate-controls': ClimateControls;
  }
}

if (!customElements.get('hp-climate-controls')) customElements.define('hp-climate-controls', ClimateControls);
