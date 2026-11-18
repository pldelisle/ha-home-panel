// <hp-room-pane>: a room view: the room's name and icon, a row of readings, then one section per subject that has tiles in the room (ADR 0039).
// Pattern: composite over the registry (Gamma et al., Composite, and Fowler's Plugin): the shell hands it the descriptors, and each one's `room`
// part draws its own tiles; humble object (Meszaros): the pane lists which subjects take part, in registry order, and decides nothing the parts decide.
// It reads the store only to draw again when the house changes (a part's tiles may come and go), and for the catalog's words.
// Must not: know a subject, read an entity, offer Arrange or any control of its own, or import a feature (ADR 0017).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {AppearanceConsumer} from '../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import type {FeatureDescriptor, FeatureEnv} from '../ui/feature.ts';
import '../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../ui/styles/index.ts';
import {forShadow} from '../ui/styles/host.ts';
import {roomColor, roomIcon, subjectsOf} from './rooms.ts';
import roomPaneOwn from './room-pane.element.css?inline';

export class RoomPane extends LitElement {
  static override properties = {
    areaId: {},
    name: {},
    features: {attribute: false},
    env: {attribute: false},
  };
  /** The area of the room shown. */
  declare areaId: string;
  /** The room's display name, from the resolver. */
  declare name: string;
  /** The registry's descriptors, in rail order: the sections follow it. */
  declare features: readonly FeatureDescriptor[];
  /** What a descriptor may read, with `room` set to this room's area. */
  declare env: FeatureEnv | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in room-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(roomPaneOwn))];

  // the parts draw their own tiles and listen for their own entities; the pane listens to every change to know which parts still have tiles here
  private readonly store = new StoreController(this, {ids: () => '*'});
  private readonly appearance = new AppearanceConsumer(this);

  constructor() {
    super();
    this.areaId = '';
    this.name = '';
    this.features = [];
    this.env = undefined;
  }

  protected override render() {
    const {env, areaId} = this;
    if (!env) return nothing;
    const {t} = this.store.store;
    const taking = subjectsOf(this.features, env, areaId);
    const chips = taking.map(f => f.room?.chip?.(env, areaId)).filter((chip): chip is string => !!chip);
    return html`<hp-pane-header .icon=${roomIcon(this.name)} .color=${roomColor(this.features)} .heading=${this.name}>
        ${
          chips.length
            ? html`<ul class="readings" slot="sub">
                ${repeat(
                  chips,
                  chip => chip,
                  chip => html`<li>${chip}</li>`,
                )}
              </ul>`
            : nothing
        }
      </hp-pane-header>
      ${repeat(
        taking,
        f => f.key,
        f =>
          html`<section class="subject" data-subject=${f.key} aria-labelledby="h-${f.key}">
            <h3 id="h-${f.key}">${t(f.title)}</h3>
            ${f.room!.part(env, areaId)}
          </section>`,
      )}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-room-pane': RoomPane;
  }
}

if (!customElements.get('hp-room-pane')) customElements.define('hp-room-pane', RoomPane);
