// climateFeature: the descriptor of the Climate subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by importing this module.
// The pane binds its detail's sheet to the sheet host's answers (ADR 0021) and holds, as a light-DOM child the legacy panel fills, the slot for the controls it still draws until #248.
// The tab is on the phone's bar, so it has no More word. Must not: draw or hold state, import the guest or another feature, or read an entity beyond what `hasClimate` reads.
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
  // The legacy panel's container for the controls, in the pane's light DOM (nothing is bound inside it): under the detail's head. #248 deletes it.
  pane: env =>
    html`<hp-climate-pane .detailOpen=${env.sheetOpen(DETAIL_SHEET)} .detail=${env.sheetDetail(DETAIL_SHEET)}
      ><div id="cctl" class="cctl" slot="controls"></div
    ></hp-climate-pane>`,
};
