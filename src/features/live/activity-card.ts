// <hp-activity-card>: one live activity's card in the Status popup: the Hilo challenge's phases, the car's charge with its buttons, the water heater's cycle.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `ActivityCardView` in the legacy `liveActs()` cards' markup; "Pause charging" runs the
// Wallbox provider's `wallboxCommands.pause` through the kit's `CommandRunner`, holding the switch's value in the overlay (ADR 0023), and "Open Car" closes the popup and asks for the Car's detail.
// Must not: read an entity or the clock (the model did), word a string, build a command by hand, or know the popup it sits in.
import {LitElement, html, nothing, svg, unsafeCSS, type TemplateResult} from 'lit';
import {styleMap} from 'lit/directives/style-map.js';
import type {ActivityCardView, CarCardView, HiloCardView, Rich, WaterCardView} from './activities.ts';
import ownCss from './activity-card.element.css?inline';
import type {RingView} from './model.ts';
import {STATUS_SHEET} from './sheets.ts';
import {wallboxCommands} from '../../providers/wallbox.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetDismissEvent, SheetRequestEvent} from '../../ui/events.ts';
import '../../ui/ring.ts'; // defines <hp-ring>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The Car's detail sheet, which "Open Car" asks for: the Car feature's id, named here since a feature does not import another. */
const CAR_DETAIL = 'car.detail';
/** The ring in a card's head, in pixels. */
const HEAD_RING = 30;

/** A line with bold parts, as the legacy cards wrote them. */
const rich = (line: Rich) => line.map(({text, strong}) => (strong ? html`<b>${text}</b>` : text));

export class ActivityCard extends LitElement {
  static override properties = {view: {attribute: false}, ring: {attribute: false}};
  /** The card the model made of the activity. */
  declare view: ActivityCardView | undefined;
  /** The activity's ring, drawn in the card's head. */
  declare ring: RingView | undefined;

  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  // the catalog for the runner's failure toast; the card reads no entity
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });

  constructor() {
    super();
    this.view = undefined;
    this.ring = undefined;
    // `glass` comes from the shell as a host attribute the rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const {view, ring} = this;
    if (!view || !ring) return nothing;
    return html`<div class="lact" style=${styleMap({'--ac': ring.color})}>${this.body(view, ring)}</div>`;
  }

  private body(view: ActivityCardView, ring: RingView): TemplateResult {
    if (view.kind === 'hilo') return this.hilo(view, ring);
    if (view.kind === 'car') return this.car(view, ring);
    return this.water(view, ring);
  }

  private head(ring: RingView, title: TemplateResult | string, right: string) {
    return html`<div class="lah">
      <hp-ring .value=${ring.progress} .color=${ring.color} .size=${HEAD_RING} .icon=${ring.icon}></hp-ring
      ><b>${title}</b><span class="rt">${right}</span>
    </div>`;
  }

  private hilo(card: HiloCardView, ring: RingView) {
    const {phases, big, note, meta} = card;
    return html`${this.head(ring, card.title, card.right)}${
        phases
          ? html`<div class="lph" role="img" aria-label=${phases.aria}>
                ${phases.segments.map(
                  s => html`<span style=${styleMap({flex: `${s.flex}`, '--pc': s.color})}>${s.label}</span>`,
                )}<i style="left:${phases.marker}%"></i>
              </div>
              <div class="lpt">
                ${phases.ticks.map(tick => html`<span style="left:${tick.left}%">${tick.text}</span>`)}
              </div>`
          : nothing
      }${big ? html`<div class="lbig"><span class="n">${big.n}</span><span class="to">${big.to}</span></div>` : nothing}
      <div class="lmeta">${note}${note && meta.length ? ' ' : ''}${rich(meta)}</div>`;
  }

  private car(card: CarCardView, ring: RingView) {
    const {big, bar, meta, pause} = card;
    return html`${this.head(ring, html`${card.name} <span>${card.state}</span>`, card.right)}
      <div class="lbig">
        <span class="n">${big.soc}<small>%</small></span
        ><span class="to">${big.limit}</span>${
          big.eta ? html`<span class="eta"><b>${big.eta.at}</b>${big.eta.inText}</span>` : nothing
        }
      </div>
      <div class="lbar" role="img" aria-label=${bar.aria}>
        <i style="width:${bar.soc}%"></i><em style="left:${bar.limit}%"></em>
      </div>
      ${meta.length ? html`<div class="lmeta">${rich(meta)}</div>` : nothing}
      <div class="lbtns">
        ${
          pause
            ? html`<button type="button" data-la="pause" @click=${() => this.onPause(pause.id, pause.resume)}>
                ${pause.label}
              </button>`
            : nothing
        }<button type="button" class="go" data-la="car" @click=${this.onOpenCar}>${card.openCar}</button>
      </div>`;
  }

  private water(card: WaterCardView, ring: RingView) {
    const {spark, big, meta} = card;
    return html`${this.head(ring, card.title, card.right)}${
        spark
          ? html`<svg
              class="lspark"
              viewBox="0 0 340 46"
              preserveAspectRatio="none"
              role="img"
              aria-label=${spark.aria}
            >
              ${svg`<path d=${spark.area} fill="color-mix(in srgb,var(--c-wh) 16%,transparent)"></path><path d=${spark.line} fill="none" stroke="var(--c-wh)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>`}
            </svg>`
          : nothing
      }
      <div class="lbig">
        <span class="n">${big.t}<small>°C</small></span
        >${big.rate === null ? nothing : html`<span class="to">${big.rate}</span>`}${
          big.left ? html`<span class="eta"><b>${big.left.main}</b>${big.left.usual}</span>` : nothing
        }
      </div>
      <div class="lmeta">${rich(meta)}</div>`;
  }

  // the switch is on while it charges: "Resume" turns it on, "Pause" off, and the overlay holds the value asked for until Home Assistant agrees
  private onPause(id: string, resume: boolean): void {
    void this.commands.runHolding(wallboxCommands.pause({id}, resume), resume);
  }

  // the popup closes first: on a tablet the Car's detail is its tab, which opening does not close the popup for
  private readonly onOpenCar = (): void => {
    this.dispatchEvent(new SheetDismissEvent(STATUS_SHEET));
    this.dispatchEvent(new SheetRequestEvent(CAR_DETAIL));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-activity-card': ActivityCard;
  }
}

if (!customElements.get('hp-activity-card')) customElements.define('hp-activity-card', ActivityCard);
