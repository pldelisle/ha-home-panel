// automationsFeature: the descriptor of the Automations subject, which the registry lists and the shell draws the rail, the pane and
// the More word from. Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane`
// template, and its element is linked by importing this module. The tab is always shown. The pane binds its flow's sheet, which a
// phone's list row opens, to the sheet host's answer (ADR 0021); the pane is the tab then, so there is no `overSheets`.
// Must not: draw or hold state, import another feature, or read an entity itself (the brief reads the store it is given).
import {html} from 'lit';
import './automations-pane.ts'; // defines <hp-automations-pane>
import {AUTOMATIONS_COLOR, AUTOMATIONS_ICON} from './identity.ts';
import {automationsBrief} from './model.ts';
import {FLOW_SHEET} from './sheets.ts';
import {automationsOf} from '../../providers/automations.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const automationsFeature: FeatureDescriptor = {
  key: 'auto',
  title: 'auto.title',
  icon: AUTOMATIONS_ICON,
  color: AUTOMATIONS_COLOR,
  phoneBar: false,
  summary: ({store}) => (store.hass ? automationsBrief(automationsOf(store.hass.states, store.names), store.t) : null),
  pane: env => html`<hp-automations-pane .flowOpen=${env.sheetOpen(FLOW_SHEET)}></hp-automations-pane>`,
};
