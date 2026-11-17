// lightsFeature: the descriptor of the Lights subject, which the registry lists and the shell draws the rail, the phone's bar and the pane from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. Lights sits on the phone's bar, so the More sheet never lists it and it has no summary. The pane
// binds the room whose sheet is open to the sheet host's answer (ADR 0021).
// It re-exports `glance`, the Home pane's tile reader (glance.ts, #267), and the ids that tile subscribes to (#268).
// Must not: draw or hold state, import the guest or another feature, or read an entity itself.
import {html} from 'lit';
import {ROOM_SHEET, roomKeyOf} from './sheets.ts';
import './lights-pane.ts'; // defines <hp-lights-pane>
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const lightsFeature: FeatureDescriptor = {
  key: 'lights',
  title: 'lights.title',
  icon: 'bulb',
  color: 'var(--warn)',
  phoneBar: true,
  // the room's sheet is over the screen: the pane stays in the page behind it
  overSheets: [ROOM_SHEET],
  pane: env =>
    html`<hp-lights-pane
      .roomKey=${env.sheetOpen(ROOM_SHEET) ? roomKeyOf(env.sheetDetail(ROOM_SHEET)) : undefined}
    ></hp-lights-pane>`,
};
export {glance} from './glance.ts';
export {lightIds} from './ids.ts';
