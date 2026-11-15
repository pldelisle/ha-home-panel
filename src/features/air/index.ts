// airFeature: the descriptor of the Air subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The pane binds its detail's sheet to the sheet host's answer, which the descriptor's `env` gives it (ADR 0021).
// The More word is the guest's (`moreLines` reads the purifiers) until the guest goes: it is not the pane's sub-line; the tab is always shown.
// Must not: draw or hold state, import the guest or another feature, or read an entity.
import {html} from 'lit';
import './air-pane.ts'; // defines <hp-air-pane>
import {DETAIL_SHEET} from './sheets.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const airFeature: FeatureDescriptor = {
  key: 'air',
  title: 'air.title',
  icon: 'aq',
  color: 'var(--ok)',
  phoneBar: false,
  // the legacy word ("Good", "No purifiers") is not the pane's line ("2 purifiers · Good"), and More shows it unchanged until the guest goes (#234)
  summary: ({guest}) => guest.moreLine('air'),
  detailSheet: DETAIL_SHEET,
  pane: env => html`<hp-air-pane .detailOpen=${env.sheetOpen(DETAIL_SHEET)}></hp-air-pane>`,
};
