// lightsFeature: the descriptor of the Lights subject, which the registry lists and the shell draws the rail, the phone's bar and the pane from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. Lights sits on the phone's bar, so the More sheet never lists it and it has no summary.
// Must not: draw or hold state, import the guest or another feature, or read an entity.
import {html} from 'lit';
import './lights-pane.ts'; // defines <hp-lights-pane>
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const lightsFeature: FeatureDescriptor = {
  key: 'lights',
  title: 'lights.title',
  icon: 'bulb',
  color: 'var(--warn)',
  phoneBar: true,
  pane: () => html`<hp-lights-pane></hp-lights-pane>`,
};
