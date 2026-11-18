// <hp-lights-room>: the Lights part of a room view: the room's light tiles, a split area's several, a linked pair side by side.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `roomUnits`, the Lights pane's own model cut to one area (ADR 0039): the same
// `<hp-light-tile>`s, read by `readLights`, switched through the same `LightsCommands` the pane uses (lifted out of it). A tap on a tile asks
// for the room's sheet (`ROOM_SHEET`), which the Lights pane draws and stays in the page behind (`overSheets`), so the room view stays.
// Must not: draw a sheet, offer Arrange or Link with (a room view only shows and switches), call the API but through its commands, or read an entity itself.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {styleMap} from 'lit/directives/style-map.js';
import {lightIds} from './ids.ts';
import {readLights, type LightsInputs} from './inputs.ts';
import {LightsCommands} from './lights-commands.ts';
import {roomUnits, type Unit} from './model.ts';
import type {AreaToggleEvent} from './light-tile.ts';
import './light-tile.ts'; // defines <hp-light-tile>
import roomOwn from './lights-room.element.css?inline';
import type {PanelApi} from '../../core/api.ts';
import {registriesOf} from '../../core/registry.ts';
import {apiContext} from '../../ui/contexts.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SystemDataController} from '../../ui/controllers/system-data.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The frontend system data's key the Lights pane writes the order and the links under: read here, never written. */
const SYSTEM_DATA_KEY = 'home_panel';

export class LightsRoom extends LitElement {
  static override properties = {
    areaId: {},
  };
  /** The area of the room shown, set by the room view. */
  declare areaId: string;

  // The element's own rules, its `:host` and what only its tree has, are in lights-room.element.css.
  static override styles = [common, unsafeCSS(forShadow(roomOwn))];

  /** The element exists only while its room is shown, so it is always the one on screen (what the system data's host asks). */
  readonly active = true;

  private readonly storeController = new StoreController(this, {ids: store => lightIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly commands = new LightsCommands(this, () => this.storeController.store.t);
  private api: PanelApi | undefined;
  // the api arrives with the connection; the order and the links are read once the element has both
  private readonly apiConsumer = new ContextConsumer(this, {
    context: apiContext,
    subscribe: false,
    callback: api => {
      this.api = api;
    },
  });
  private readonly systemData = new SystemDataController(
    this,
    () => (this.api ? {api: this.api, store: this.storeController.store} : null),
    SYSTEM_DATA_KEY,
  );
  private inputs: LightsInputs | undefined;
  private units: Unit[] = [];

  constructor() {
    super();
    this.areaId = '';
  }

  protected override willUpdate(): void {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    this.inputs = readLights(hass.states, registriesOf(hass), store.names, store.config, this.systemData.value);
    this.units = roomUnits(this.inputs, this.areaId, {t: store.t, compact: this.appearance.value?.compact === true});
  }

  protected override render() {
    if (!this.units.length) return nothing;
    return html`<div class="lrows" @area-toggle=${this.onToggle}>
      ${repeat(
        this.units,
        unit => unit.key,
        unit => this.renderUnit(unit),
      )}
    </div>`;
  }

  private renderUnit({key, tiles}: Unit) {
    if (tiles.length === 1) return html`<hp-light-tile data-unit=${key} .tile=${tiles[0]}></hp-light-tile>`;
    return html`<div class="llink on" data-unit=${key} style=${styleMap({'--lc': tiles[0].pairTint || undefined})}>
      <hp-light-tile .tile=${tiles[0]}></hp-light-tile><hp-light-tile .tile=${tiles[1]}></hp-light-tile>
    </div>`;
  }

  // the bulb: the same switch the pane sends, over the tiles of the whole house, since a linked pair may cross rooms
  private readonly onToggle = (e: AreaToggleEvent): void => {
    e.stopPropagation();
    void this.commands.toggleArea(this.inputs?.tiles ?? [], e.detail.key);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-lights-room': LightsRoom;
  }
}

if (!customElements.get('hp-lights-room')) customElements.define('hp-lights-room', LightsRoom);
