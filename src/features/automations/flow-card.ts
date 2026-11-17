// <hp-flow-card>: one flow card of the Automations tab: its title and sentence, the pill that says how the run ended (counting up
// while it runs), the run picker of the selected card, the legend and the Mermaid drawing of the automation with the run lit up.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `FlowCardView`; the drawing goes through the mount module
// (`mountFlow`), mounted after the first update and again when the definition or the theme changes, destroyed on disconnect.
// Must not: build the graph or its definition (the model does), load Mermaid itself, or hold the selection (it tells the pane).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {CloseSelectionEvent, SelectRunEvent} from './events.ts';
import {mountFlow, type FlowMount} from './flow-mount.ts';
import {runningText, type FlowCardView} from './model.ts';
import shared from './styles.css?inline';
import own from './flow-card.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import {lensLike} from '../../ui/lens.ts';
import {common, pill} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class FlowCard extends LitElement {
  static override properties = {view: {attribute: false}};
  declare view: FlowCardView | undefined;

  static override styles = [common, pill, unsafeCSS(forShadow(shared)), unsafeCSS(forShadow(own))];

  // the store for its words only: the card listens to no entity
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  private mount: FlowMount | undefined;
  private mounted = '';

  constructor() {
    super();
    this.view = undefined;
    // a running run's pill counts up each second; the drawing is not touched
    new TickController(this, 1000, () => this.view?.flow?.pill.since !== undefined);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.mount?.destroy();
    this.mount = undefined;
    this.mounted = '';
  }

  protected override render() {
    const v = this.view;
    if (!v) return nothing;
    const {t} = this.storeController.store;
    if (!v.flow)
      return html`<section class="aubox auc">
          <div class="auhead">
            <div>
              <h3>${v.title}</h3>
              <p>${t('automations.card.unreadable')}</p>
            </div>
          </div>
        </section>
        ${lensLike(this.getRootNode())}`;
    const {flow} = v;
    const selected = v.kind === 'selected';
    const pillText = flow.pill.since === undefined ? flow.pill.text : runningText(flow.pill.since, Date.now(), t);
    return html`<section class="aubox auc${selected ? ' ausel' : ''}">
        <div class="auhead">
          <div>
            <h3>${v.title}</h3>
            <p>${flow.sentence}</p>
          </div>
          <div class="auhr">
            <span class="pill ${flow.pill.tone}">${pillText}</span>${
              selected
                ? html`<button
                    type="button"
                    class="close"
                    aria-label=${t('automations.card.close')}
                    @click=${this.close}
                  >
                    ×
                  </button>`
                : nothing
            }
          </div>
        </div>
        ${
          flow.picker.length
            ? html`<div class="aupick">
                ${flow.picker.map(
                  c =>
                    html`<button
                      type="button"
                      class="chip${c.sel ? ' sel' : ''}"
                      @click=${() => this.dispatchEvent(new SelectRunEvent({item: v.item, run: c.run}))}
                    >
                      <span class="dot" style="background:var(--${c.dot})"></span>${c.label}
                    </button>`,
                )}
              </div>`
            : nothing
        }
        <div class="aulegend">
          <span><i class="on"></i>${t('automations.legend.taken')}</span
          ><span><i class="run"></i>${t('automations.legend.waiting')}</span
          ><span><i class="no"></i>${t('automations.legend.stopped')}</span
          ><span><i class="off"></i>${t('automations.legend.notTaken')}</span>
        </div>
        <div class="augraph"></div>
      </section>
      ${lensLike(this.getRootNode())}`;
  }

  protected override updated(): void {
    const def = this.view?.flow?.def;
    const box = this.renderRoot.querySelector<HTMLElement>('.augraph');
    const a = this.appearance.value;
    const key = def && box ? `${def}\n${a?.theme}\n${a?.glass.on}` : '';
    if (key === this.mounted) return;
    this.mount?.destroy();
    this.mount = undefined;
    this.mounted = key;
    if (!key || !box || !def) return;
    const {t} = this.storeController.store;
    this.mount = mountFlow(box, def, {
      noLibrary: t('automations.flow.noLibrary'),
      failed: t('automations.flow.failed'),
    });
  }

  private readonly close = (): void => {
    this.dispatchEvent(new CloseSelectionEvent());
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-flow-card': FlowCard;
  }
}

if (!customElements.get('hp-flow-card')) customElements.define('hp-flow-card', FlowCard);
