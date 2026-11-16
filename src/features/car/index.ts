// carFeature: the descriptor of the Car subject, which the registry lists and the shell draws the rail, the phone's bar and the pane from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by importing this module.
// The detail is still the legacy panel's sheet, `sh-car`, which the card asks for and the sheet host places, so the descriptor has no `detailSheet` yet (#252).
// Must not: draw or hold state, import the guest or another feature, or read an entity beyond what `findCar` reads.
import {html} from 'lit';
import './car-pane.ts'; // defines <hp-car-pane>
import {findCar} from '../../providers/fordpass.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const carFeature: FeatureDescriptor = {
  key: 'car',
  title: 'car.title',
  icon: 'car',
  color: 'var(--c-ev)',
  phoneBar: true,
  // a house with no FordPass car has nothing to show; until the first states arrive the tab is shown
  available: ({store}) => !store.hass || findCar(store.hass.states) !== null,
  pane: () => html`<hp-car-pane></hp-car-pane>`,
};
