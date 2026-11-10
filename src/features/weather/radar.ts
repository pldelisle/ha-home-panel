// mountRadar: puts the HACS Weather Radar Card in a container and gives back the two things a caller does with it, update and destroy.
// Pattern: a mount function returning a disposable handle (the shape of a Lit directive's disconnect, Lit docs, Custom directives): the card is a
// third party's element loaded from the household's own Lovelace resource, so it is created and removed by hand in a container Lit binds nothing in (ADR 0016).
// Must not: draw anything of its own but the failure note, import a card at build time (it may not be installed), or touch the container after destroy.
import type {PanelApi} from '../../core/api.ts';
import type {PanelHass} from '../../core/hass.ts';

const CARD = 'weather-radar-card';
/** Where HACS puts the card when no Lovelace resource names it. */
const FALLBACK_URL = '/hacsfiles/weather-radar-card/weather-radar-card.js';

export interface RadarOptions {
  /** The map's colours follow the theme. */
  dark: boolean;
  /** A narrow window: a shorter map, and a drag on it scrolls the sheet. */
  phone: boolean;
  /** What the card reads at once; `update` gives it the later ones. */
  hass: PanelHass | null;
  /** The one line shown when the card did not load, in the panel's language. */
  failed: string;
}

export interface RadarMount {
  update(hass: PanelHass): void;
  destroy(): void;
}

interface RadarCard extends HTMLElement {
  setConfig(config: object): void;
  hass: PanelHass | null;
}

/**
 * Loads the card from its Lovelace resource URL, so a dashboard that also uses it does not load it twice, falling back to HACS's own
 * path, and waits for it to define its element. A card already defined is not loaded again.
 */
async function loadCard(api: PanelApi): Promise<void> {
  if (customElements.get(CARD)) return;
  const resources = await api.lovelaceResources().catch(() => []);
  const url = resources.find(resource => /\/weather-radar-card\.js/.test(resource.url))?.url ?? FALLBACK_URL;
  await import(/* @vite-ignore */ url);
  await customElements.whenDefined(CARD);
}

/** The card's configuration: RainViewer, the last two hours, the map's size and what a gesture does, as the legacy panel set it. */
const config = ({dark, phone}: Pick<RadarOptions, 'dark' | 'phone'>) => ({
  type: 'custom:weather-radar-card',
  data_source: 'RainViewer',
  map_style: dark ? 'GreyDark' : 'Grey',
  past_minutes: 120,
  zoom_level: 7,
  height: phone ? '340px' : '440px',
  show_zoom: true,
  show_playback: true,
  show_recenter: true,
  show_scale: true,
  show_snow: true,
  // wheel and (on phones) drag stay with the sheet, so it still scrolls over the map
  disable_wheel_zoom: true,
  disable_scroll: phone,
});

/** Mounts the card in `host` once it has loaded; the handle works at once, and `destroy` before the load finishes mounts nothing. */
export function mountRadar(host: HTMLElement, api: PanelApi, options: RadarOptions): RadarMount {
  let card: RadarCard | null = null;
  let hass = options.hass;
  let gone = false;
  loadCard(api).then(
    () => {
      if (gone) return;
      card = document.createElement(CARD) as RadarCard;
      card.setConfig(config(options));
      card.hass = hass;
      host.replaceChildren(card);
    },
    () => {
      if (gone) return;
      const note = document.createElement('p');
      note.className = 'muted rnote';
      note.textContent = options.failed;
      host.replaceChildren(note);
    },
  );
  return {
    update(next) {
      hass = next;
      if (card) card.hass = next;
    },
    destroy() {
      gone = true;
      card?.remove();
      card = null;
    },
  };
}
