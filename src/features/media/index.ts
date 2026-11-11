// mediaFeature: the descriptor of the Media subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The pane binds the tile whose controls are open to the sheet host's answers, which the descriptor's
// `env` gives it (ADR 0021).
// Must not: draw or hold state, import the guest or another feature, or read an entity (the brief line reads the store it is given).
import {html} from 'lit';
import {readMedia} from './inputs.ts';
import {mediaBrief} from './model.ts';
import {CONTROLS_SHEET, controlsKeyOf} from './sheets.ts';
import './media-pane.ts'; // defines <hp-media-pane>
import type {FeatureDescriptor} from '../../ui/feature.ts';

export const mediaFeature: FeatureDescriptor = {
  key: 'media',
  title: 'media.title',
  icon: 'tv',
  color: 'var(--c-home)',
  phoneBar: false,
  // always shown: a house with no player says "Nothing playing", as it did
  summary: ({store}) => {
    const {hass} = store;
    if (!hass) return null;
    const registries = {entities: hass.entities, devices: hass.devices, areas: hass.areas};
    return mediaBrief(readMedia(hass.states, registries, store.names), store.t);
  },
  pane: env =>
    html`<hp-media-pane
      .controlsKey=${env.sheetOpen(CONTROLS_SHEET) ? controlsKeyOf(env.sheetDetail(CONTROLS_SHEET)) : undefined}
    ></hp-media-pane>`,
};
