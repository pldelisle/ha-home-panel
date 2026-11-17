// airFeature: the descriptor of the Air subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The pane binds its detail's sheet and the reading whose history is open to the sheet host's answers, which the descriptor's `env` gives it (ADR 0021).
// The More word is `airBrief`, the legacy word and not the pane's sub-line; the tab is always shown.
// It re-exports `glance`, the Home pane's tile reader (glance.ts, #267), and the ids that tile subscribes to (#268).
// Must not: draw or hold state, import the guest or another feature, or read an entity itself (the brief line reads the store it is given).
import {html} from 'lit';
import './air-pane.ts'; // defines <hp-air-pane>
import {airBrief} from './model.ts';
import {isHistoryRequest} from './history.ts';
import {DETAIL_SHEET, HISTORY_SHEET} from './sheets.ts';
import {registriesOf} from '../../core/registry.ts';
import {milaRooms} from '../../providers/mila.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const airFeature: FeatureDescriptor = {
  key: 'air',
  title: 'air.title',
  icon: 'aq',
  color: 'var(--ok)',
  phoneBar: false,
  // the legacy word ("Good", "No purifiers") is not the pane's line ("2 purifiers · Good"), and More shows it unchanged
  summary: ({store}) => {
    const {hass} = store;
    if (!hass) return null;
    return airBrief(milaRooms(hass.states, registriesOf(hass), store.names), store.t);
  },
  detailSheet: DETAIL_SHEET,
  overSheets: [HISTORY_SHEET],
  pane: env => {
    // the request is the object the tile sent, kept by the sheet host: the same one at every draw, so the pane is not asked to draw again
    const request = env.sheetOpen(HISTORY_SHEET) ? env.sheetDetail(HISTORY_SHEET) : undefined;
    return html`<hp-air-pane
      .detailOpen=${env.sheetOpen(DETAIL_SHEET)}
      .historyRequest=${isHistoryRequest(request) ? request : undefined}
    ></hp-air-pane>`;
  },
};
export {glance} from './glance.ts';
export {airIds} from './ids.ts';
