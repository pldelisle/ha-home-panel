// climateTile: one of the Climate tiles as the phone's grid and a room view both draw it: the thermostat's name, its reading, its status word, its tone and whether it is on.
// Pattern: one template function two elements share (as the Lights `renderUnit` is, ADR 0019's one-source rule): the grid it sits in is `climate-tiles.css`,
// which both elements adopt through `forShadow`; the words and the tone are `climateItems`'s, so the two never word a tile twice.
// Must not: read the store, ask for a sheet (the element that holds the grid listens for `tile-open`), or word a string.
import {html} from 'lit';
import type {ClimateItem} from './items.ts';
import '../../ui/stat-tile.ts'; // defines <hp-stat-tile>

/** The class that sets a thermostat or the heat pump that is on (`act`) apart from one that is off (`rest`); the house is neither. */
export const activeClass = (active: boolean | null): string => (active === null ? '' : active ? ' act' : ' rest');

/** `wide` is the house's tile across the top of the phone's grid; a room view has none. */
export function climateTile({id, icon, name, sub, value, missing, tone, active}: ClimateItem, wide = false) {
  const look = `${tone}${activeClass(active)}`;
  return html`<hp-stat-tile
    .key=${id}
    .icon=${icon}
    .label=${name}
    .sub=${sub}
    .value=${value}
    .missing=${missing ?? false}
    .tone=${wide ? `${look} wide trail` : look}
  ></hp-stat-tile>`;
}
