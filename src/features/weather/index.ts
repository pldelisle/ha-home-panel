// weatherFeature: the descriptor of the Weather subject, which the registry lists and the shell draws the rail, the bar, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by
// importing this module. The pane's detail host is a light-DOM node the sheet host fills, slotted into the element (ADR 0016).
// Must not: draw or hold state, import the guest or another feature, or read an entity (the model's brief line reads the store it is given).
import {html} from 'lit';
import {readWeather} from './inputs.ts';
import {weatherBrief} from './model.ts';
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
  // `wxhost` is the guest's container: the sheet host puts the detail panel in it on a tablet, and Lit binds nothing in it
  pane: () => html`<hp-weather-pane><div id="wxhost" slot="detail"></div></hp-weather-pane>`,
};
