// climateFeature: the descriptor of the Climate subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by importing this module.
// The pane binds its detail's sheet to the sheet host's answers (ADR 0021), and to whether a room view is shown, over which the detail is a sheet on a tablet too;
// the tab is on the phone's bar, so it has no More word. Its `room` part is the room's thermostat tile and its temperature chip (ADR 0039).
// It re-exports `glance`, the Home pane's tile reader (glance.ts, #267), and the ids that tile subscribes to (#268).
// Must not: draw or hold state, import another feature, or read an entity beyond what `hasClimate` reads.
import {html} from 'lit';
import './climate-pane.ts'; // defines <hp-climate-pane>
import './climate-room.ts'; // defines <hp-climate-room>
import {hasClimate, readClimate} from './inputs.ts';
import {climateChip, climateRoomAreas} from './room-items.ts';
import {DETAIL_SHEET} from './sheets.ts';
import {registriesOf} from '../../core/registry.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const climateFeature: FeatureDescriptor = {
  key: 'climate',
  title: 'climate.title',
  icon: 'therm',
  color: 'var(--c-heat)',
  phoneBar: true,
  // a house with no thermostat and no heat pump has nothing to show; until the first states arrive the tab is shown
  available: ({store}) => !store.hass || hasClimate(store.hass.states, store.config),
  detailSheet: DETAIL_SHEET,
  pane: env =>
    html`<hp-climate-pane
      .detailOpen=${env.sheetOpen(DETAIL_SHEET)}
      .detail=${env.sheetDetail(DETAIL_SHEET)}
      .over=${env.room !== null}
    ></hp-climate-pane>`,
  room: {
    // the areas the thermostats sit in; the heat pump is on the tab only
    areas: ({store}) => (store.hass ? climateRoomAreas(store.config, registriesOf(store.hass)) : []),
    part: (_env, areaId) => html`<hp-climate-room .areaId=${areaId}></hp-climate-room>`,
    chip: ({store}, areaId) => {
      const {hass} = store;
      if (!hass) return null;
      const registries = registriesOf(hass);
      return climateChip(readClimate(hass.states, registries, store.config), areaId, registries, store.fmt);
    },
  },
};
export {glance} from './glance.ts';
export {climateIds} from './ids.ts';
