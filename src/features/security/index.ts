// securityFeature: the descriptor of the Security subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The More word is the guest's until the Home move (#227), which reads the doors and the motion
// through the provider; the tab is always shown, as it was.
// Must not: draw or hold state, import the guest or another feature, or read an entity.
import {html} from 'lit';
import './security-pane.ts'; // defines <hp-security-pane>
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const securityFeature: FeatureDescriptor = {
  key: 'cams',
  title: 'security.title',
  icon: 'shield',
  color: 'var(--m-purple)',
  phoneBar: false,
  // the legacy word ("Doors closed · motion now") is not the pane's line, and More shows it unchanged until #227
  summary: ({guest}) => guest.moreLine('cams'),
  pane: () => html`<hp-security-pane></hp-security-pane>`,
};
