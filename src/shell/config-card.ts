// <hp-config-card>: the card across the top of the Home pane that tells an admin what in the panel's config could not be used
// (spec 13): a heading, how many settings, one line per problem with its path in code type, and the footer.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the store's `configProblems`, worded by the catalog; the legacy `renderConfigCard`'s
// aside, drawn in the Home pane's light DOM like the pane (ADR 0032), so home-pane.css styles it. Its host is the `.cfgerrh` slot, hidden while there is nothing to say, and carries `translate="no"`.
// Must not: check the config (the resolver does), show itself to a user who is not an admin, or write the config.
import {LitElement, html, nothing} from 'lit';
import type {ConfigProblem} from '../core/config.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';

export class ConfigCard extends LitElement {
  // the problems change with the config, which tells every subscriber; no entity is read
  private readonly storeController = new StoreController(this, {ids: () => []});

  /** Light DOM: the pane's tests and the panel's sheet find the aside where the legacy card was (ADR 0032). */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('cfgerrh');
    this.id = 'cfgerr';
    this.setAttribute('translate', 'no');
  }

  /** The problems an admin is shown; none for another user, so the card is not drawn. */
  get problems(): readonly ConfigProblem[] {
    const {store} = this.storeController;
    return store.isAdmin ? store.configProblems : [];
  }

  protected override willUpdate(): void {
    this.hidden = this.problems.length === 0;
  }

  protected override render() {
    const problems = this.problems;
    if (!problems.length) return nothing;
    const {t} = this.storeController.store;
    // every message opens with its path (`rooms[1].icon: ...`): the path is set in <code>, the rest is the message
    const line = (p: ConfigProblem) => {
      const message = t(p.key, p.values);
      return message.startsWith(p.path)
        ? html`<li><code>${p.path}</code>${message.slice(p.path.length)}</li>`
        : html`<li>${message}</li>`;
    };
    return html`<aside class="card cfgerr" aria-labelledby="cfgerr-h">
      <h3 id="cfgerr-h">${t('config.title')}</h3>
      <p>${t('config.intro', {n: problems.length})}</p>
      <ul>
        ${problems.map(line)}
      </ul>
      <p class="s">${t('config.footer')}</p>
    </aside>`;
  }
}

if (!customElements.get('hp-config-card')) customElements.define('hp-config-card', ConfigCard);
