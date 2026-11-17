// homeFeature: the descriptor of the Home subject, which the registry lists first and the shell draws the rail, the bar and the pane from.
// Pattern: plug-in (Fowler, PoEAA, Plugin) kept in the shell, since Home is the shell's composition of the features' cards (spec 24): the
// shell imports features, a feature never imports the shell or another feature (ADR 0017). It replaced `legacyFeature('home')` (#268).
// Must not: draw or hold state, or read an entity (the pane's cards do); Home is always shown and has no word in More (it is on the bar).
import {html} from 'lit';
import './home-pane.ts'; // defines <hp-home-pane>
import type {FeatureDescriptor} from '../ui/feature.ts';

export const homeFeature: FeatureDescriptor = {
  key: 'home',
  title: 'home.title',
  icon: 'house',
  color: 'var(--c-grid)',
  phoneBar: true,
  pane: () => html`<hp-home-pane></hp-home-pane>`,
};
