// climateFeature: the descriptor of the Climate subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by importing this module.
// The pane binds its detail's sheet to the sheet host's answers (ADR 0021); the tab is on the phone's bar, so it has no More word.
// It re-exports `glance`, the Home pane's tile reader (glance.ts, #267).
// Must not: draw or hold state, import the guest or another feature, or read an entity beyond what `hasClimate` reads.
import {html} from 'lit';
import './climate-pane.ts'; // defines <hp-climate-pane>
import {hasClimate} from './inputs.ts';
import {DETAIL_SHEET} from './sheets.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const climateFeature: FeatureDescriptor = {
  key: 'climate',
  title: 'climate.title',
  icon: 'therm',
  color: 'var(--c-wh)',
  phoneBar: true,
  // a house with no thermostat and no heat pump has nothing to show; until the first states arrive the tab is shown
  available: ({store}) => !store.hass || hasClimate(store.hass.states, store.config),
  detailSheet: DETAIL_SHEET,
  pane: env =>
    html`<hp-climate-pane
      .detailOpen=${env.sheetOpen(DETAIL_SHEET)}
      .detail=${env.sheetDetail(DETAIL_SHEET)}
    ></hp-climate-pane>`,
};
export {glance} from './glance.ts';
