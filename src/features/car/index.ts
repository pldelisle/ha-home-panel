// carFeature: the descriptor of the Car subject, which the registry lists and the shell draws the rail, the phone's bar and the pane from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by importing this module.
// The pane binds its detail's sheet to the sheet host's answers (ADR 0021) and holds, as light-DOM children the legacy panel fills, the container of the charger's and comfort's cards until #253.
// Must not: draw or hold state, import the guest or another feature, or read an entity beyond what `findCar` reads.
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
  // The legacy panel's container, in the pane's light DOM (nothing is bound inside it): the charger's and comfort's cards, which the detail puts between the battery and the charging
  // history through its `controls` slot. The guest draws into them and listens to them; #253 draws them as elements and deletes this.
  pane: env =>
    html`<hp-car-pane .detailOpen=${env.sheetOpen(DETAIL_SHEET)}
      ><div class="two" id="car-controls" slot="controls">
        <div class="inner" id="car-charger"></div>
        <div class="inner" id="car-comfort"></div></div
    ></hp-car-pane>`,
};
