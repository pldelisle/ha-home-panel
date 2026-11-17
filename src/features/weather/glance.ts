// glance: what the Home pane reads of Weather for the phone's weather card, the name a screen reader gives it and the entities that name reads (#380).
// Pattern: a pure reader over the store (a view model, Meszaros' humble object's other half), as Climate's `glance` is: reading through `readWeather` is allowed here
// because the Home pane hands over the store it subscribes with, and it words nothing itself (`weatherCardName` does, from the catalog).
// Must not: read the clock, import the DOM, Lit, the shell or another feature, hold text the household reads, or draw anything.
import type {PanelStore} from '../../core/store.ts';
import {weatherIds} from './ids.ts';
import {readWeather} from './inputs.ts';
import {weatherCardName} from './model.ts';

/** The entities `weatherCardLabel` reads, for a pane that draws it: the store tells the pane when one changes. */
export const weatherCardLabelIds = (store: PanelStore): string[] => weatherIds(store.config);

/** What a screen reader calls the phone's Home weather card, one button over the weather and Who's home ("" before Home Assistant answers). */
export function weatherCardLabel(store: PanelStore): string {
  const {hass} = store;
  return hass ? weatherCardName(readWeather(hass.states, store.config), store) : '';
}
