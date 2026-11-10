// weatherFeature: the descriptor of the Weather subject, which the registry lists and the shell draws the rail, the bar, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by
// importing this module. The pane binds its detail's sheet and the tile whose history is open to the sheet host's answers, which the descriptor's `env` gives it (ADR 0021).
// Must not: draw or hold state, import the guest or another feature, or read an entity (the model's brief line reads the store it is given).
import {html} from 'lit';
import {readWeather} from './inputs.ts';
import {weatherBrief} from './model.ts';
import {DETAIL_SHEET, HISTORY_SHEET} from './sheets.ts';
import {tileKeyOf} from './tiles.ts';
import './weather-pane.ts'; // defines <hp-weather-pane>
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const weatherFeature: FeatureDescriptor = {
  key: 'weather',
  title: 'weather.title',
  icon: 'wx',
  color: 'var(--m-blue)',
  phoneBar: false,
  // always shown: a house with no weather entity shows dashes, as it did
  summary: ({store}) => {
    const {hass} = store;
    return hass ? weatherBrief(readWeather(hass.states, store.config), store) || null : null;
  },
  detailSheet: DETAIL_SHEET,
  overSheets: [HISTORY_SHEET],
  pane: env =>
    html`<hp-weather-pane
      .detailOpen=${env.sheetOpen(DETAIL_SHEET)}
      .historyTile=${env.sheetOpen(HISTORY_SHEET) ? tileKeyOf(env.sheetDetail(HISTORY_SHEET)) : undefined}
    ></hp-weather-pane>`,
};
