// climateFeature: the descriptor of the Climate subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by importing this module.
// The pane binds its detail's sheet to the sheet host's answers (ADR 0021) and holds, as light-DOM children the legacy panel fills, the slots for what it still draws until #246 and #248.
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
  // The legacy panel's containers, in the pane's light DOM (nothing is bound inside them): the controls under the head, the chart under the tiles, and the
  // heatmap and the outside chart under the detail (`#chost`, where the sheet host puts the legacy panel on a tablet). #248 deletes the first, #246 the rest.
  pane: env =>
    html`<hp-climate-pane .detailOpen=${env.sheetOpen(DETAIL_SHEET)} .detail=${env.sheetDetail(DETAIL_SHEET)}
      ><div id="cctl" class="cctl" slot="controls"></div>
      <div id="cchart" slot="chart"></div>
      <div id="chost" slot="legacy"></div
    ></hp-climate-pane>`,
};
