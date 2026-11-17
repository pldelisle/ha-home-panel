// <hp-car-departure>: the Car tab's departure row (what Ford saved, and its switch) and its editor, a sheet with Cancel and Save (docs/apple-hig-audit-car-2026-11-17.md, finding 5): the time, the cabin
// to choose, and the seven days as a checkmark list; Save waits, and says why, until `validate` allows it.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `departureControls`, the model's pure view; the draft is its state, edited locally, validated and sent once (a form draft: Fowler's
// Unit of Work in miniature), begun again when Ford's saved schedule changes (the cabin choice kept: Ford does not report it) and when the editor is cancelled. The editor is a native `<dialog>` (ADR 0036): Cancel, Save or Escape close it, never a tap on the backdrop, which would drop the draft.
// Must not: read an entity or the clock (the inputs and the model did), build a command by hand (commands.ts does), send a draft that `validate` refuses, or keep the draft anywhere else.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {createRef, ref, type Ref} from 'lit/directives/ref.js';
import {repeat} from 'lit/directives/repeat.js';
import ownCss from './car-departure.element.css?inline';
import {saveSchedule, toggleDeparture} from './commands.ts';
import {departureControls, type DepartureView} from './controls.ts';
import dialogCss from './dialog.css?inline';
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
import type {Command} from '../../core/commands.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {dialogLook, stopEscape} from '../../ui/dialogs.ts';
import {ico} from '../../ui/icons.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import type {SwitchChangeDetail} from '../../ui/switch.ts';
import '../../ui/switch.ts'; // defines <hp-switch>

export class CarDeparture extends LitElement {
  static override properties = {inputs: {attribute: false}};
  /** What the pane read: the car, the charger and the car's entities. */
  declare inputs: CarFeatureInputs | undefined;

  static override styles = [common, dialogLook, unsafeCSS(forShadow(dialogCss)), unsafeCSS(forShadow(ownCss))];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private readonly editor: Ref<HTMLDialogElement> = createRef();
  // The draft: what the person edited and has not sent, begun from Ford's saved schedule and again when that schedule changes (`savedKey`) or the editor is cancelled.
  private draft: ScheduleDraft | null = null;
  private savedKey: string | undefined;
  private view: DepartureView | null = null;

  constructor() {
    super();
    this.inputs = undefined;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

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
    this.view = departureControls(inputs, this.draft, {t, fmt, overlay: this.overlay});
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const {row, editor} = view;
    return html`<div class="dep">
        <button type="button" class="open" @click=${this.openEditor} aria-haspopup="dialog">
          ${ico('clock', 20)}<span class="tx"><b>${row.title}</b><small>${row.line}</small></span>
        </button>
        <hp-switch
          .checked=${row.on}
          .disabled=${row.disabled}
          .label=${row.label}
          @change=${(e: CustomEvent<SwitchChangeDetail>) =>
            this.ask(toggleDeparture(view.car, e.detail.checked), e.detail.checked)}
        ></hp-switch>
        <button type="button" class="chev" @click=${this.openEditor} aria-hidden="true" tabindex="-1">
          ${ico('chev', 18)}
        </button>
      </div>
      <dialog class="dsheet" ${ref(this.editor)} aria-labelledby="dt" @cancel=${this.cancel} @keydown=${stopEscape}>
        <div class="nav">
          <button type="button" class="dbtn l" @click=${this.cancel}>${editor.cancel}</button>
          <h4 id="dt" tabindex="-1" .autofocus=${true}>${editor.title}</h4>
          <button type="button" class="dbtn prim r" ?disabled=${!editor.canSave} @click=${this.save}>
            ${editor.save}
          </button>
        </div>
        <div class="sb">
          <div class="list">
            <label class="lrow">
              <span class="lbl">${editor.time.label}</span>
              <input
                class="dtime"
                type="time"
                step="300"
                .value=${editor.time.value}
                @change=${(e: Event) => this.edit(draft => ({...draft, time: (e.target as HTMLInputElement).value}))}
              />
            </label>
            <label class="lrow">
              <span class="lbl">${editor.cabin.label}</span>
              <select
                class="cabin"
                @change=${(e: Event) =>
                  this.edit(draft => ({...draft, temp: (e.target as HTMLSelectElement).value as CabinTemperature}))}
              >
                <option value="" ?selected=${editor.cabin.chosen === undefined} disabled>${editor.cabin.choose}</option>
                ${editor.cabin.options.map(
                  option =>
                    html`<option value=${option.value} ?selected=${option.value === editor.cabin.chosen}>
                      ${option.label}
                    </option>`,
                )}
              </select>
            </label>
          </div>
          <div class="gl">${editor.repeat}</div>
          <div class="list" role="group" aria-label=${editor.repeat}>
            ${repeat(
              editor.days,
              ({day}) => day,
              ({day, name, checked}) =>
                html`<button
                  type="button"
                  class="lrow"
                  role="checkbox"
                  aria-checked=${checked ? 'true' : 'false'}
                  @click=${() => this.edit(draft => toggleDay(draft, day))}
                >
                  <span class="lbl">${name}</span><span class="chk">${checked ? ico('check', 20) : nothing}</span>
                </button>`,
            )}
          </div>
          <p class="foot">${editor.reason ? html`<b>${editor.reason}.</b> ` : nothing}${editor.foot}</p>
        </div>
      </dialog>`;
  }

  // arrow fields, so the template hands the same functions at every render
  private readonly openEditor = (): void => {
    this.editor.value?.showModal();
  };

  // Cancel (the button, Escape): the draft starts again from what Ford saved, the cabin choice kept, and the sheet closes
  private readonly cancel = (e?: Event): void => {
    e?.preventDefault();
    this.draft = redraft(this.draft, this.inputs?.car?.schedule ?? null);
    this.editor.value?.close();
    this.requestUpdate();
  };

  // Save: once `validate` allows it (the button waits until then); the time is rounded to Ford's five-minute steps, sent once, and the sheet closes
  private readonly save = (): void => {
    const {draft} = this;
    if (!draft || validate(draft)) return;
    const {t, fmt} = this.storeController.store;
    const sent = withFiveMinutes(draft);
    this.draft = sent;
    this.editor.value?.close();
    this.requestUpdate();
    void this.commands.run(saveSchedule(sent, {fmt, t}));
  };

  // an edit of the draft: a new value, and the sheet draws it
  private edit(change: (draft: ScheduleDraft) => ScheduleDraft): void {
    if (this.draft) this.draft = change(this.draft);
    this.requestUpdate();
  }

  // what a tap asks for shows at once (the overlay holds it, and the row draws again) and the command is sent
  private ask(command: Command, held: unknown): void {
    void this.commands.runHolding(command, held);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-departure': CarDeparture;
  }
}

if (!customElements.get('hp-car-departure')) customElements.define('hp-car-departure', CarDeparture);
