// carFeature: the descriptor of the Car subject, which the registry lists and the shell draws the rail, the phone's bar and the pane from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by importing this module.
// The pane binds its detail's sheet to the sheet host's answers (ADR 0021).
// It re-exports `glance`, the Home pane's tile reader (glance.ts, #267), and the ids that tile subscribes to (#268).
// Must not: draw or hold state, import another feature, or read an entity beyond what `findCar` reads.
import {html} from 'lit';
import './car-pane.ts'; // defines <hp-car-pane>
import {DETAIL_SHEET} from './sheets.ts';
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
  detailSheet: DETAIL_SHEET,
  pane: env => html`<hp-car-pane .detailOpen=${env.sheetOpen(DETAIL_SHEET)}></hp-car-pane>`,
};
export {glance} from './glance.ts';
export {carIds} from './ids.ts';
