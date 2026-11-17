// automationsFeature: the descriptor of the Automations subject, which the registry lists and the shell draws the rail, the pane and
// the More word from. Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane`
// template, and its element is linked by importing this module. The tab is always shown; the phone's fifth slot calls it "Rules".
// Must not: draw or hold state, import another feature, or read an entity itself (the brief reads the store it is given).
import {html} from 'lit';
import './automations-pane.ts'; // defines <hp-automations-pane>
import {automationsBrief} from './model.ts';
import {automationsOf} from '../../providers/automations.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const automationsFeature: FeatureDescriptor = {
  key: 'auto',
  title: 'auto.title',
  shortTitle: 'auto.short',
  icon: 'flow',
  color: 'var(--c-heat)',
  phoneBar: false,
  summary: ({store}) => (store.hass ? automationsBrief(automationsOf(store.hass.states, store.names), store.t) : null),
  pane: () => html`<hp-automations-pane></hp-automations-pane>`,
};
