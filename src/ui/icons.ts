// The panel's icons as Lit templates: `ico(name, size)` draws one, `IconName` is the set a descriptor may name, and `weatherIcon`
// draws a condition. Pattern: Registry (Fowler, PoEAA) of static templates (Lit docs, Templates: parsed once, never re-rendered);
// the paths are those of the legacy class's `ico` and `wxIcon`, and a test compares the first with its text. A name arrives here with its first user.
// Must not: import a feature or the shell, or draw anything but an `<svg>`: `ico` takes its colour from `currentColor`, `weatherIcon` has its own.
import {svg, type SVGTemplateResult} from 'lit';

/** The inner markup of each icon, 24 by 24, stroked with the current colour. */
export const ICONS = {
  house: svg`<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>`,
  bulb: svg`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>`,
  therm: svg`<path d="M10 3a2 2 0 0 1 4 0v10.3a4.5 4.5 0 1 1-4 0z"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/>`,
  wx: svg`<path d="M9 3v1.5M3.5 5.5l1 1M2 10h1.5M13.5 6.5l1-1M5.5 10a3.5 3.5 0 0 1 6.4-2M8 20h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 8 20z"/>`,
  car: svg`<path d="M5 16 6.5 10a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16M4 16h16v3H4zM7 19v2M17 19v2"/>`,
  bolt: svg`<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`,
  wind: svg`<path d="M4 17c2-6 14-6 16 0M7 13l-1-3M12 12V8M17 13l1-3"/>`,
  drop: svg`<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>`,
  clock: svg`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  hum: svg`<path d="M7.5 19.8a9 9 0 1 1 9 0"/><path d="M12 7.5s3 3.2 3 5.4a3 3 0 0 1-6 0c0-2.2 3-5.4 3-5.4z"/>`,
  aq: svg`<path d="M7.5 19.8a9 9 0 1 1 9 0"/><path d="M10 9h.01M14 9h.01M8.5 12h.01M12 11h.01M15.5 12h.01M10 15h.01M14 15h.01M12 13.8h.01"/>`,
  tv: svg`<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8"/>`,
  pp: svg`<path d="M5 6v12l8-6zM16 6v12M20 6v12"/>`,
  spk: svg`<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="7.8" r="1.3"/><circle cx="12" cy="14.5" r="3"/>`,
  play: svg`<path d="M7.5 5.5v13l11-6.5z" fill="currentColor"/>`,
  pause: svg`<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3.2"/>`,
  shield: svg`<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>`,
  flow: svg`<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2.2"/><path d="M7 6c5 0 5 6 9.8 6M7 18c5 0 5-6 9.8-6"/>`,
  more: svg`<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>`,
  menu: svg`<path d="M4 7h16M4 12h16M4 17h16"/>`,
  gear: svg`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  moon: svg`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>`,
  sun: svg`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  sunauto: svg`<path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 3v3M4.2 6.2l2.1 2.1M19.8 6.2l-2.1 2.1"/>`,
} satisfies Record<string, SVGTemplateResult>;

export type IconName = keyof typeof ICONS;

/** An icon of `size` pixels, hidden from assistive technology: the button or heading that holds it carries the name. */
export const ico = (name: IconName, size = 20) =>
  svg`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- weather ----------

type Kind = 'clear' | 'part' | 'cloud' | 'rain' | 'snow' | 'sleet' | 'storm' | 'fog' | 'wind';

// Home Assistant's condition words, each down to one of the drawn icons
const KIND_OF_WORD: Readonly<Record<string, Kind>> = {
  'clear-night': 'clear',
  sunny: 'clear',
  partlycloudy: 'part',
  cloudy: 'cloud',
  fog: 'fog',
  rainy: 'rain',
  pouring: 'rain',
  hail: 'snow',
  snowy: 'snow',
  'snowy-rainy': 'sleet',
  lightning: 'storm',
  'lightning-rainy': 'storm',
  windy: 'wind',
  'windy-variant': 'wind',
  exceptional: 'cloud',
};

/** Which of the nine drawn icons a condition is: a Home Assistant word, or an integration's own words (`Mainly Sunny`, `Light Rain`). */
export function conditionKind(condition: string | null): Kind {
  const s = String(condition || '').toLowerCase();
  if (s in KIND_OF_WORD) return KIND_OF_WORD[s];
  if (/thunder/.test(s)) return 'storm';
  if (/snow|flurr/.test(s) && /rain|drizzle/.test(s)) return 'sleet';
  if (/snow|flurr|ice|hail/.test(s)) return 'snow';
  if (/rain|shower|drizzle/.test(s)) return 'rain';
  if (/fog|mist|haze/.test(s)) return 'fog';
  if (/wind/.test(s)) return 'wind';
  if (/partly|mix|few|a few clouds|mainly sunny|mainly clear/.test(s)) return 'part';
  if (/cloud|overcast/.test(s)) return 'cloud';
  if (/sun|clear/.test(s)) return 'clear';
  return 'cloud';
}

const sun = (day: boolean) =>
  day
    ? svg`<circle cx="12" cy="12" r="4.6" fill="var(--m-amber)"/><g class="rays" stroke="var(--m-amber)" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>`
    : svg`<path d="M15.5 3.5a8 8 0 1 0 5 11.8A6.5 6.5 0 0 1 15.5 3.5z" fill="var(--m-blue)"/>`;
const cloud = (x = 0, y = 0, fill = 'var(--fg3)') =>
  svg`<g class="cld"><path transform="translate(${x} ${y})" d="M7 19h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1A4.5 4.5 0 0 0 7 19z" fill="${fill}"/></g>`;
const drops = svg`<g class="drp" stroke="var(--c-home)" stroke-width="1.8" stroke-linecap="round"><path d="M8 20.5l-1 2M12 20.5l-1 2M16 20.5l-1 2"/></g>`;
const flakes = svg`<g class="flk" fill="var(--c-home)"><circle cx="7.5" cy="21.5" r="1.2"/><circle cx="12" cy="22.3" r="1.2"/><circle cx="16.5" cy="21.5" r="1.2"/></g>`;

const GLYPH: Record<Kind, (day: boolean) => SVGTemplateResult> = {
  clear: day => sun(day),
  part: day => svg`<g transform="translate(-3 -3) scale(.8)">${sun(day)}</g>${cloud(1.5, 1.5)}`,
  cloud: () => cloud(0, -1),
  rain: () => svg`${cloud(0, -3)}${drops}`,
  snow: () => svg`${cloud(0, -3)}${flakes}`,
  sleet: () =>
    svg`${cloud(0, -3)}<path d="M8 20.5l-1 2M16 20.5l-1 2" stroke="var(--c-home)" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="22" r="1.2" fill="var(--c-home)"/>`,
  storm: () =>
    svg`${cloud(0, -3)}<path class="bolt" d="M12.5 15.5 10 20h3l-1.5 3.5" fill="none" stroke="var(--m-amber)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  fog: () =>
    svg`${cloud(0, -4)}<g class="fog" stroke="var(--fg3)" stroke-width="1.8" stroke-linecap="round"><path d="M4 18.5h16M6 21.5h12"/></g>`,
  wind: () =>
    svg`<g class="wnd" fill="none" stroke="var(--fg3)" stroke-width="1.9" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/></g>`,
};

/**
 * The icon of a condition, `size` pixels square, in colour (it takes none from the text); `label` is the condition's name for a
 * screen reader, in the panel's language, and `day` draws the sun or the moon where the condition has one.
 */
export const weatherIcon = (condition: string | null, size = 28, day = true, label = '') =>
  svg`<svg class="wxi" width=${size} height=${size} viewBox="0 0 24 24" role="img" aria-label=${label}>${GLYPH[conditionKind(condition)](day)}</svg>`;
