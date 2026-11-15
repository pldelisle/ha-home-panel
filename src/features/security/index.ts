// securityFeature: the descriptor of the Security subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The pane binds the camera and the sensor whose sheet is open to the sheet host's answers (ADR 0021).
// The More word is the guest's (`moreLines` reads the doors and the motion through the provider) until the guest goes; the tab is always shown.
// Must not: draw or hold state, import the guest or another feature, or read an entity.
import {html} from 'lit';
import {CAMERA_SHEET, HISTORY_SHEET, entityIdOf} from './sheets.ts';
import './security-pane.ts'; // defines <hp-security-pane>
import './security-card.ts'; // defines <hp-security-card>, which the guest places on the Home tab (ADR 0024)
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const securityFeature: FeatureDescriptor = {
  key: 'cams',
  title: 'security.title',
  icon: 'shield',
  color: 'var(--m-purple)',
  phoneBar: false,
  // the legacy word ("Doors closed · motion now") is not the pane's line, and More shows it unchanged until the guest goes
  summary: ({guest}) => guest.moreLine('cams'),
  // the two sheets are over the screen on any tab: the pane stays in the page behind them, so the tab does not change
  overSheets: [CAMERA_SHEET, HISTORY_SHEET],
  pane: env =>
    html`<hp-security-pane
      .cameraId=${env.sheetOpen(CAMERA_SHEET) ? entityIdOf(env.sheetDetail(CAMERA_SHEET)) : undefined}
      .historyId=${env.sheetOpen(HISTORY_SHEET) ? entityIdOf(env.sheetDetail(HISTORY_SHEET)) : undefined}
    ></hp-security-pane>`,
};
