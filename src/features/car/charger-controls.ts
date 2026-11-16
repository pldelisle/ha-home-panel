// <hp-charger-controls>: the Car detail's charger card: the Wallbox's current limit as a radio group, the charge limit the car reports (read-only), and the charging and lock switches.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `chargerControls`, the model's pure view of the inputs and the held values: a tap holds the value it asks for in the panel's overlay and runs a `Command`
// through the kit's `CommandRunner` (ADR 0023), at once and once; `<hp-seg>` and `<hp-switch-row>` are the kit's controls, and the card's own rules are in charger-controls.element.css.
// Must not: read an entity or the clock (the inputs and the model did), build a command by hand (commands.ts does), word a string, or keep a value of the charger (the overlay does).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {setAmps, toggleChargerLock, togglePause} from './commands.ts';
import {chargerControls, type ChargerView, type SwitchRowView} from './controls.ts';
import controlsCss from './controls.css?inline';
import ownCss from './charger-controls.element.css?inline';
import type {CarFeatureInputs} from './inputs.ts';
import blockCss from './styles.css?inline';
import type {Command} from '../../core/commands.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/seg.ts'; // defines <hp-seg>
import type {SegChangeDetail} from '../../ui/seg.ts';
import {common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import type {SwitchChangeDetail} from '../../ui/switch.ts';
import '../../ui/switch-row.ts'; // defines <hp-switch-row>
import type {Overlay} from '../../ui/overlay-store.ts';

export class ChargerControls extends LitElement {
  static override properties = {inputs: {attribute: false}};
  /** What the pane read: the car, the charger and the car's entities. */
  declare inputs: CarFeatureInputs | undefined;

  static override styles = [
    common,
    inner,
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
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private view: ChargerView | null = null;

  constructor() {
    super();
    this.inputs = undefined;
    // `glass` and `compact` come from the shell as host attributes the card's rules test
    new AppearanceConsumer(this);
  }

  protected override willUpdate(): void {
    const {inputs} = this;
    const {t, fmt} = this.storeController.store;
    this.view = inputs ? chargerControls(inputs, {t, fmt, overlay: this.overlay}) : null;
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const {power, limit, charging, lock} = view;
    return html`<div class="inner fill">
        <h3>${view.title}</h3>
        <p>${view.line}</p>
        <div class="ctl-l">${power.heading}</div>
        <hp-seg
          .label=${power.label}
          .options=${power.options}
          .value=${power.chosen}
          .disabled=${power.disabled}
          @change=${(e: CustomEvent<SegChangeDetail>) => this.onAmps(power.id, Number(e.detail.value))}
        ></hp-seg>
        <div class="hint">${power.hint}</div>
        <div class="ctl-l">${limit.heading}</div>
        <hp-seg .label=${limit.label} .options=${limit.options} .value=${limit.chosen} .disabled=${true}></hp-seg>
        <div class="hint">${limit.hint}</div>
        ${this.renderRow(charging, (on, id) => this.ask(togglePause({id}, on), on))}
        ${this.renderRow(lock, (on, id) => this.ask(toggleChargerLock({id}, on), on))}
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  private renderRow({id, title, line, on, disabled, label}: SwitchRowView, toggle: (on: boolean, id: string) => void) {
    return html`<hp-switch-row
      .heading=${title}
      .line=${line}
      .checked=${on}
      .disabled=${disabled}
      .label=${label}
      @change=${(e: CustomEvent<SwitchChangeDetail>) => {
        if (id !== null) toggle(e.detail.checked, id);
      }}
    ></hp-switch-row>`;
  }

  // the current limit shows at once and is sent once
  private onAmps(id: string | null, amps: number): void {
    if (id !== null) this.ask(setAmps({id}, amps), amps);
  }

  // what a tap asks for shows at once (the overlay holds it, and the card draws again) and the command is sent
  private ask(command: Command, held: unknown): void {
    for (const key of command.holds ?? []) this.optimistic.hold(key, held);
    void this.commands.run(command);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-charger-controls': ChargerControls;
  }
}

if (!customElements.get('hp-charger-controls')) customElements.define('hp-charger-controls', ChargerControls);
