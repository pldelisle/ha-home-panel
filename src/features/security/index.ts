// securityFeature: the descriptor of the Security subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The pane binds the camera and the sensor whose sheet is open to the sheet host's answers (ADR 0021).
// Its `room` part is the room's cameras and sensors (ADR 0039): a camera or a sensor opens its sheet over the room view.
// The More word is `securityMoreWord` over the provider's doors and motion, the legacy panel's rule (#277); the tab is always shown.
// Must not: draw or hold state, import another feature, or read an entity other than through the shared door and motion provider.
import {html} from 'lit';
import {CAMERA_SHEET, HISTORY_SHEET, entityIdOf} from './sheets.ts';
import './security-pane.ts'; // defines <hp-security-pane>
import './security-card.ts'; // defines <hp-security-card>, which the Home pane places
import './security-room.ts'; // defines <hp-security-room>
import type {FeatureDescriptor} from '../../ui/feature.ts';
import {registriesOf} from '../../core/registry.ts';
import {doorMotionSensors} from '../../providers/door-motion.ts';
import {securityMoreWord} from './model.ts';
import {readSecurity, securityAreas} from './inputs.ts';

export const securityFeature: FeatureDescriptor = {
  key: 'cams',
  title: 'security.title',
  icon: 'shield',
  color: 'var(--m-purple)',
  phoneBar: false,
  // the legacy word ("Doors closed · motion now"), not the pane's line
  summary: ({store}) => {
    const {hass} = store;
    return hass ? securityMoreWord(doorMotionSensors(hass.states, registriesOf(hass), store.names), store.t) : null;
  },
  // the two sheets are over the screen on any tab: the pane stays in the page behind them, so the tab does not change
  overSheets: [CAMERA_SHEET, HISTORY_SHEET],
  pane: env =>
    html`<hp-security-pane
      .cameraId=${env.sheetOpen(CAMERA_SHEET) ? entityIdOf(env.sheetDetail(CAMERA_SHEET)) : undefined}
      .historyId=${env.sheetOpen(HISTORY_SHEET) ? entityIdOf(env.sheetDetail(HISTORY_SHEET)) : undefined}
    ></hp-security-pane>`,
  room: {
    // the areas of the cameras and of the door and motion sensors; one with no area is in no room
    areas: ({store}) => {
      const {hass} = store;
      if (!hass) return [];
      const registries = registriesOf(hass);
      return securityAreas(readSecurity(hass.states, registries, store.names), registries);
    },
    part: (_env, areaId) => html`<hp-security-room .areaId=${areaId}></hp-security-room>`,
  },
};
