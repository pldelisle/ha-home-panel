// <hp-car-actions>: the Car tab's actions row (docs/apple-hig-audit-car-2026-11-17.md, findings 4 and 7): Unlock or Lock, Start… or Stop engine, and Pause or Resume charging, each with
// how things stand under its name; unlocking and starting ask first in a dialog (HIG, Alerts), and the start's dialog holds the heaters the car runs with it as switches.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `carActions`, the model's pure view; a tap holds the value it asks for in the panel's overlay and runs a `Command` through the kit's
// `CommandRunner` (ADR 0023). The two confirmations are native `<dialog>`s opened with `showModal()` (ADR 0035): the browser gives them the top layer, the focus and Escape; a tap on the backdrop cancels.
// Must not: read an entity or the clock (the inputs and the model did), build a command by hand (commands.ts does), word a string, or send a start or an unlock before its dialog's button.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {createRef, ref, type Ref} from 'lit/directives/ref.js';
import {repeat} from 'lit/directives/repeat.js';
import ownCss from './car-actions.element.css?inline';
import {honk, lockCar, remoteStart, toggleHeater, togglePause, unlockCar} from './commands.ts';
import {carActions, type ActionsView} from './controls.ts';
import dialogCss from './dialog.css?inline';
import {closeOnBackdrop, stopEscape} from './dialogs.ts';
import type {CarFeatureInputs} from './inputs.ts';
import type {Command} from '../../core/commands.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {ico, type IconName} from '../../ui/icons.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import type {SwitchChangeDetail} from '../../ui/switch.ts';
import '../../ui/switch.ts'; // defines <hp-switch>

export class CarActions extends LitElement {
  static override properties = {inputs: {attribute: false}};
  /** What the pane read: the car, the charger and the car's entities. */
  declare inputs: CarFeatureInputs | undefined;

  static override styles = [common, unsafeCSS(forShadow(dialogCss)), unsafeCSS(forShadow(ownCss))];

  // the catalog and the formatters; no entity, so no state change reaches the row but through the pane's `inputs`
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private readonly unlockDialog: Ref<HTMLDialogElement> = createRef();
  private readonly startDialog: Ref<HTMLDialogElement> = createRef();
  private view: ActionsView | null = null;

  constructor() {
    super();
    this.inputs = undefined;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

  protected override willUpdate(): void {
    const {inputs} = this;
    const {t, fmt} = this.storeController.store;
    this.view = inputs ? carActions(inputs, {t, fmt, overlay: this.overlay}) : null;
  }

  protected override render() {
    const {view} = this;
    const car = this.inputs?.ref;
    if (!view || !car) return nothing;
    const {lock, start, pause, honk: horn} = view;
    return html`<div class="acts">
        ${
          lock
            ? this.renderAction(lock.locked ? 'unlock' : 'lock', lock, () =>
                lock.confirm ? this.unlockDialog.value?.showModal() : this.ask(lockCar(car), true),
              )
            : nothing
        }
        ${
          start
            ? this.renderAction('lpow', start, () =>
                start.running ? this.ask(remoteStart(car, false), false) : this.startDialog.value?.showModal(),
              )
            : nothing
        }
        ${
          pause
            ? this.renderAction(pause.paused ? 'play' : 'pause', pause, () =>
                this.ask(togglePause({id: pause.id}, pause.paused), pause.paused),
              )
            : nothing
        }
        ${horn ? this.renderAction('spk', horn, () => void this.commands.run(honk({id: horn.id}))) : nothing}
      </div>
      ${
        lock?.confirm
          ? html`<dialog
              ${ref(this.unlockDialog)}
              aria-labelledby="ut"
              @keydown=${stopEscape}
              @click=${closeOnBackdrop}
            >
              <h4 id="ut" tabindex="-1" .autofocus=${true}>${lock.confirm.title}</h4>
              <p>${lock.confirm.line}</p>
              <div class="btns">
                <button type="button" class="dbtn" @click=${() => this.unlockDialog.value?.close()}>
                  ${lock.confirm.cancel}</button
                ><button
                  type="button"
                  class="dbtn prim"
                  @click=${() => {
                    this.unlockDialog.value?.close();
                    this.ask(unlockCar(car), false);
                  }}
                >
                  ${lock.confirm.confirm}
                </button>
              </div>
            </dialog>`
          : nothing
      }
      ${
        start
          ? html`<dialog ${ref(this.startDialog)} aria-labelledby="st" @keydown=${stopEscape} @click=${closeOnBackdrop}>
              <h4 id="st" tabindex="-1" .autofocus=${true}>${start.confirm.title}</h4>
              <p>${start.confirm.line}</p>
              ${
                start.options.length
                  ? html`<div class="gl">${start.optionsLabel}</div>
                      <div class="list">
                        ${repeat(
                          start.options,
                          option => option.key,
                          option =>
                            html`<div class="lrow">
                              <span class="lbl">${option.name}</span>
                              <hp-switch
                                .checked=${option.on}
                                .label=${option.name}
                                @change=${(e: CustomEvent<SwitchChangeDetail>) =>
                                  this.ask(
                                    toggleHeater(car, option.key, e.detail.checked, option.name),
                                    e.detail.checked,
                                  )}
                              ></hp-switch>
                            </div>`,
                        )}
                      </div>`
                  : nothing
              }
              ${start.options.length ? html`<p class="foot">${start.optionsFoot}</p>` : nothing}
              ${start.seats ? html`<p class="foot">${start.seats}</p>` : nothing}
              <div class="btns">
                <button type="button" class="dbtn" @click=${() => this.startDialog.value?.close()}>
                  ${start.confirm.cancel}</button
                ><button
                  type="button"
                  class="dbtn prim"
                  @click=${() => {
                    this.startDialog.value?.close();
                    this.ask(remoteStart(car, true), true);
                  }}
                >
                  ${start.confirm.confirm}
                </button>
              </div>
            </dialog>`
          : nothing
      }`;
  }

  // one action: its name and, under it, how things stand (the horn has no state to say)
  private renderAction(icon: IconName, {label, line = ''}: {label: string; line?: string}, act: () => void) {
    return html`<button type="button" class="act" @click=${act}>
      ${ico(icon, 20)}<span class="tx">${label}${line ? html`<small>${line}</small>` : nothing}</span>
    </button>`;
  }

  // what a tap asks for shows at once (the overlay holds it, and the row draws again) and the command is sent
  private ask(command: Command, held: unknown): void {
    void this.commands.runHolding(command, held);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-actions': CarActions;
  }
}

if (!customElements.get('hp-car-actions')) customElements.define('hp-car-actions', CarActions);
