// energyFeature: the descriptor of the Energy subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is linked by
// importing this module. The pane binds its detail's sheet and the two cards' to the sheet host's answers, which the descriptor's `env` gives it (ADR 0021).
// The More word is `moreWord` (glance.ts), the legacy panel's rule (#277); the tab is always shown.
// It re-exports `glance` and `waterGlance`, the Home pane's two tile readers (glance.ts, #267), and the ids they subscribe to (#268).
// Must not: draw or hold state, import another feature, or read an entity itself.
import {html} from 'lit';
import './energy-pane.ts'; // defines <hp-energy-pane>
import {DETAIL_SHEET, HILO_SHEET, WATER_SHEET} from './sheets.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';
import {moreWord} from './glance.ts';

export const energyFeature: FeatureDescriptor = {
  key: 'energy',
  title: 'energy.title',
  icon: 'bolt',
  color: 'var(--c-grid)',
  phoneBar: false,
  // the legacy word ("3.24 kW now"), not the pane's sub-line ("Grid supplying 3.24 kW · ...")
  summary: ({store}) => moreWord(store),
  detailSheet: DETAIL_SHEET,
  // the water heater's and Hilo's sheets open from the pane's tiles and from Home's Water heater tile, over any tab: the pane stays behind them
  overSheets: [WATER_SHEET, HILO_SHEET],
  pane: env =>
    html`<hp-energy-pane
      .detailOpen=${env.sheetOpen(DETAIL_SHEET)}
      .waterOpen=${env.sheetOpen(WATER_SHEET)}
      .hiloOpen=${env.sheetOpen(HILO_SHEET)}
    ></hp-energy-pane>`,
};
export {glance, waterGlance, type GlanceDeps} from './glance.ts';
export {energyIds} from './ids.ts';
