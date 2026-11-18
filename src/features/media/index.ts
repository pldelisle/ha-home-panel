// mediaFeature: the descriptor of the Media subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The pane binds the tile whose controls are open to the sheet host's answers, which the descriptor's
// `env` gives it (ADR 0021). Its `room` part is the tiles of the players in a room view (ADR 0039), whose sheet the pane draws behind it.
// Must not: draw or hold state, import another feature, or read an entity (the brief line reads the store it is given).
import {html} from 'lit';
import {readMedia} from './inputs.ts';
import {mediaBrief, mediaRoomAreas} from './model.ts';
import {CONTROLS_SHEET, controlsKeyOf} from './sheets.ts';
import './media-pane.ts'; // defines <hp-media-pane>
import './media-room.ts'; // defines <hp-media-room>
import './scene-tiles.ts'; // defines <hp-scene-tiles>, which the Home pane places
import {registriesOf} from '../../core/registry.ts';
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const mediaFeature: FeatureDescriptor = {
  key: 'media',
  title: 'media.title',
  icon: 'tv',
  color: 'var(--c-home)',
  phoneBar: false,
  // a tile's controls are over the screen: the pane stays in the page behind them, so a room view's tile opens them and the view stays
  overSheets: [CONTROLS_SHEET],
  // always shown: a house with no player says "Nothing playing", as it did
  summary: ({store}) => {
    const {hass} = store;
    if (!hass) return null;
    return mediaBrief(readMedia(hass.states, registriesOf(hass), store.names), store.t);
  },
  room: {
    // the areas the speakers sit in, and the television's when it has one
    areas: ({store}) => {
      const {hass} = store;
      return hass ? mediaRoomAreas(readMedia(hass.states, registriesOf(hass), store.names)) : [];
    },
    part: (_env, areaId) => html`<hp-media-room .areaId=${areaId}></hp-media-room>`,
  },
  pane: env =>
    html`<hp-media-pane
      .controlsKey=${env.sheetOpen(CONTROLS_SHEET) ? controlsKeyOf(env.sheetDetail(CONTROLS_SHEET)) : undefined}
    ></hp-media-pane>`,
};
