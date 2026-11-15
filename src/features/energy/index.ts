// energyFeature: the descriptor of the Energy subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by
// importing this module. The pane binds its two sheets to the sheet host's answers, which the descriptor's `env` gives it (ADR 0021), and holds the
// legacy detail's host (`#ehost`, slotted), where the sheet host puts the legacy panel on a tablet until #240. The tab is always shown.
// Must not: draw or hold state, import the guest or another feature, or read an entity.
import {html} from 'lit';
import './energy-pane.ts'; // defines <hp-energy-pane>
import {HILO_SHEET, WATER_SHEET} from './sheets.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const energyFeature: FeatureDescriptor = {
  key: 'energy',
  title: 'energy.title',
  icon: 'bolt',
  color: 'var(--c-grid)',
  phoneBar: false,
  // the legacy word ("3.24 kW now") is not the pane's sub-line ("Grid supplying 3.24 kW · ..."), and More shows it unchanged until the guest goes (#241)
  summary: ({guest}) => guest.moreLine('energy'),
  // the water heater's and Hilo's sheets open from the pane's tiles and from Home's Water heater tile, over any tab: the pane stays behind them
  overSheets: [WATER_SHEET, HILO_SHEET],
  pane: env =>
    html`<hp-energy-pane .waterOpen=${env.sheetOpen(WATER_SHEET)} .hiloOpen=${env.sheetOpen(HILO_SHEET)}
      ><div id="ehost" slot="detail"></div
    ></hp-energy-pane>`,
};
