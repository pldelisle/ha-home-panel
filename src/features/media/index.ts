// mediaFeature: the descriptor of the Media subject, which the registry lists and the shell draws the rail, the pane and the More word from.
// Pattern: plug-in (Fowler, PoEAA, Plugin): the feature's folder says what it is as data and one `pane` template, and its element is
// linked by importing this module. The template also holds the guest's three containers until #218 (ADR 0016): `#mtiles`, the
// phone's tiles, and `#mtv` and `#media`, the cards those tiles open in the card sheet; Lit binds nothing inside them.
// Must not: draw or hold state, import the guest or another feature, or read an entity (the brief line reads the store it is given).
import {html} from 'lit';
import {readMedia} from './inputs.ts';
import {mediaBrief} from './model.ts';
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
  // The pane is the shell's first child of the section, so it is told `active`; the containers after it are the guest's, one line
  // with no text between them, as the legacy feature wrote them.
  pane: () =>
    html`<hp-media-pane></hp-media-pane>
      <div class="mtiles" id="mtiles"></div>
      <div class="card" id="mtv" hidden></div>
      <div class="card" id="media"></div>`,
};
