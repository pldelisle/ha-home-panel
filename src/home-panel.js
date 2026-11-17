// Home panel for Home Assistant: a wall-tablet and phone dashboard (energy, climate, lights, weather, car, air, automations).
// Registered with panel_custom, so it runs inside the HA frontend and uses the signed-in user's connection.
// Nothing secret lives in this file: the house's entities, rooms and people come from the panel's config (see core/config.ts) or are found in hass.
import {pickStack, inHours, reminderLeft} from './stack.js';
import {FR_ATTR, createFrench} from './i18n/fr.js';
import {autoMethods} from './auto.js';
import {StaleReply} from './core/api.ts';
import {sunTimes} from './core/sun.ts';
import {browserDefaults} from './core/i18n/browser.ts';
import {createFormatters} from './core/i18n/format.ts';
import {englishLocale, panelLocale} from './core/i18n/locale.ts';
import {ok, esc, plural} from './legacy/globals.js';
import {registriesOf} from './core/registry.ts';
import {rateRoom} from './providers/air-quality.ts';
import {doorMotionSensors} from './providers/door-motion.ts';
import {departureSchedule, findCar, readCar} from './providers/fordpass.ts';
import {hiloChallenge, hiloRates} from './providers/hilo.ts';
import {hydroQuebec} from './providers/hydro-quebec.ts';
import {milaRooms} from './providers/mila.ts';
import {powerNow} from './providers/power.ts';
import {dayKeys, flowIds, hourlyFlow, meterTotals, powerWindows, waterDay} from './providers/power-history.ts';
import {ensureFonts} from './fonts.js';
// Liquid Glass: whether this engine can run an SVG filter inside backdrop-filter (Chromium only)
const LENS_OK =
  typeof navigator !== 'undefined' &&
  'userAgentData' in navigator &&
  !!window.CSS &&
  window.CSS.supports('backdrop-filter', 'url(#x)');

const LIGHT_ORDER_KEY = 'home_panel';

const sum = a => a.reduce((x, y) => x + (y || 0), 0);
const f1 = v => (v == null ? '–' : (+v).toFixed(1));
const ms = v => (typeof v === 'number' ? v : Date.parse(v));
// a YYYY-MM-DD day key as its UTC noon: read by a UTC-pinned set (fmtUtcEn, fmtUtc), a key names its own day whatever zone the browser or the house is in
const dayAt = k => new Date(k + 'T12:00:00Z');
// drop the leading words every name shares ("Lumière Dessus Piano", "Lumiere Dessus Porte" -> "Piano", "Porte")
const fold = x =>
  x
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const shortNames = names => {
  if (names.length < 2) return names;
  const w = names.map(n => String(n).split(/\s+/));
  let k = 0;
  while (w.every(x => x.length > k + 1 && fold(x[k]) === fold(w[0][k]))) k++;
  return w.map(x => x.slice(k).join(' '));
};

// card order for the column packing: the lights first
// 'open-air' is dead until the Home move deletes it (#268): nothing draws in that card any more
const LAYOUT = ['lights', 'open-air'];
// thermostats without an HA area: the area each Hilo room belongs to
// areas the Phone tab shows as part of another, the way Apple Home groups them: the parking spot's charger and camera live in the garage
// AL_AREAS (from the config): HA area → Adaptive Lighting switch, for areas the panel can't match on its own
// Tabs view: one pane per subject, for a tablet fixed to the wall. The rail, the phone's bar and the panes
// are the shell's (src/shell/features.ts); the guest fills what is inside them.
// colour of a black body at k kelvin (Tanner Helland's fit), for the colour-temperature strips and sliders
const kelvinRGB = k => {
  const t = Math.min(40000, Math.max(1000, k)) / 100,
    c = v => Math.round(Math.min(255, Math.max(0, v)));
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return `rgb(${c(r)},${c(g)},${c(b)})`;
};
// The words the stack's air card and the Home tile say, the legacy panel's own until the stack (#266) and Home (#268) move: the
// provider rates the air (src/providers/air-quality.ts) and words nothing. [name, unit] by pollutant, and the level words.
const AIR_WORDS = {pm2_5: ['PM2.5', 'µg/m³'], co2: ['CO₂', 'ppm'], voc: ['VOC', 'µg/m³'], co: ['CO', 'ppm']};
const AIR_LEVELS = ['Good', 'Moderate', 'Poor'];
const ICON = {
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevl: '<path d="m15 6-6 6 6 6"/>',
  lsun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lpow: '<path d="M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0"/>',
  lsnow: '<path d="M12 2v20M4 7l16 10M20 7 4 17"/>',
  lflame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7z"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
  link: '<path d="M10 13.5a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.6l-1.2 1.2"/><path d="M14 10.5a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.6l1.2-1.2"/>',
  unlink:
    '<path d="M15.5 13l3.2-3.2a4 4 0 0 0-5.7-5.6l-1.6 1.6"/><path d="M8.5 11l-3.2 3.2a4 4 0 0 0 5.7 5.6l1.6-1.6"/><path d="M8 3v2.5M3 8h2.5M16 21v-2.5M21 16h-2.5"/>',
  more: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  therm: '<path d="M10 3a2 2 0 0 1 4 0v10.3a4.5 4.5 0 1 1-4 0z"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  wx: '<path d="M9 3v1.5M3.5 5.5l1 1M2 10h1.5M13.5 6.5l1-1M5.5 10a3.5 3.5 0 0 1 6.4-2M8 20h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 8 20z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  hp: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="10" cy="12" r="3.5"/><path d="M10 8.5v7M6.5 12h7M17 9v6"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  dinner: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 3.5-3 7h3v11"/>',
  exit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8"/>',
  vol: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6"/>',
  mute: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 10l4 4M21 10l-4 4"/>',
  volup: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M19 9v6M16 12h6"/>',
  voldn: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 12h6"/>',
  pp: '<path d="M5 6v12l8-6zM16 6v12M20 6v12"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M9 21l2.5-6.5L14 17v4M7.5 12.5l2-4.2 3.6.7 2.2 3.5h2.2M11.5 14.5l-1.3-6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  house: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v6H3z"/>',
  door: '<path d="M6 21V4h12v17M4 21h16M14 12h.01"/>',
  desk: '<path d="M3 9h18M5 9v11M19 9v11M14 9v6h5"/>',
  bed: '<path d="M3 19V6M3 14h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5h.01"/>',
  bath: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  car: '<path d="M5 16 6.5 10a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16M4 16h16v3H4zM7 19v2M17 19v2"/>',
  fan: '<path d="M12 12c0-5 1-8 4-8s2 5-4 8zM12 12c5 0 8 1 8 4s-5 2-8-4zM12 12c0 5-1 8-4 8s-2-5 4-8zM12 12c-5 0-8-1-8-4s5-2 8 4z"/>',
  wind: '<path d="M4 17c2-6 14-6 16 0M7 13l-1-3M12 12V8M17 13l1-3"/>',
  rear: '<rect x="4" y="6" width="16" height="12" rx="3"/><path d="M8 10h8M8 14h8"/>',
  wheel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M4.5 10h5M14.5 10h5M12 14v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  // the room status chips, after Apple Home's: gauges for humidity and air, a plug face, a purifier tower, a motion diamond, a CO detector, a speaker
  hum: '<path d="M7.5 19.8a9 9 0 1 1 9 0"/><path d="M12 7.5s3 3.2 3 5.4a3 3 0 0 1-6 0c0-2.2 3-5.4 3-5.4z"/>',
  aq: '<path d="M7.5 19.8a9 9 0 1 1 9 0"/><path d="M10 9h.01M14 9h.01M8.5 12h.01M12 11h.01M15.5 12h.01M10 15h.01M14 15h.01M12 13.8h.01"/>',
  outlet:
    '<rect x="4" y="4" width="16" height="16" rx="4.5" fill="currentColor"/><path d="M9.5 8.5V12M14.5 8.5V12M11 16.3a1 1 0 0 1 2 0" stroke="var(--bg)" stroke-width="2"/>',
  purifier:
    '<rect x="5" y="5" width="11" height="16" rx="2"/><path d="M8 9h5M8 12h5M8 15h5M8 18h5M19 4c1.2.8 1.2 1.7 0 2.5s-1.2 1.7 0 2.5"/>',
  motion: '<path d="M15 4.5 22.5 12 15 19.5 7.5 12z"/><path d="M8.5 7 3.5 12l5 5"/>',
  co: '<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M7 10.5v3M9.5 10.5v3M12 10.5v3"/><circle cx="16.5" cy="12" r="1.5"/>',
  lux: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  spk: '<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="7.8" r="1.3"/><circle cx="12" cy="14.5" r="3"/>',
  prev: '<path d="M6 6v12"/><path d="M19 6.5v11L10 12z" fill="currentColor"/>',
  next: '<path d="M18 6v12"/><path d="M5 6.5v11l9-5.5z" fill="currentColor"/>',
  play: '<path d="M7.5 5.5v13l11-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sunauto: '<path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 3v3M4.2 6.2l2.1 2.1M19.8 6.2l-2.1 2.1"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  warn: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  sunup: '<path d="M12 3v4.5M9.5 5.5 12 3l2.5 2.5M4.9 11.4l1.6 1.6M19.1 11.4l-1.6 1.6M3 19h18M7 19a5 5 0 0 1 10 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" stroke-width="2.6"/>',
  flow: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2.2"/><path d="M7 6c5 0 5 6 9.8 6M7 18c5 0 5-6 9.8-6"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  cam: '<path d="M3 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM17 10.5l4-2.5v8l-4-2.5"/><circle cx="9" cy="12" r="2.5"/>',
};
const ico = (k, s = 20) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// the house picture from the config (house_image, resolved as config.house), one for the light theme and one for the dark; none by default
const houseImg = house =>
  house
    ? `<img class="house photo day" alt="" src="${esc(house.day)}"><img class="house photo night" alt="" src="${esc(house.night)}">`
    : '';
// ---------- weather helpers ----------
const COND = {
  'clear-night': 'Clear',
  cloudy: 'Cloudy',
  fog: 'Fog',
  hail: 'Hail',
  lightning: 'Thunderstorms',
  'lightning-rainy': 'Thunderstorms and rain',
  partlycloudy: 'Partly cloudy',
  pouring: 'Heavy rain',
  rainy: 'Rain',
  snowy: 'Snow',
  'snowy-rainy': 'Rain and snow',
  sunny: 'Sunny',
  windy: 'Windy',
  'windy-variant': 'Windy and cloudy',
  exceptional: 'Unusual weather',
};
const condName = c => (!c ? '' : COND[c] || String(c).charAt(0).toUpperCase() + String(c).slice(1).toLowerCase());
// HA condition codes, or Environment Canada's own words, down to one of the drawn icons
const condKind = c => {
  const s = String(c || '').toLowerCase();
  if (COND[s])
    return {
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
    }[s];
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
};
const wxIcon = (c, sz = 28, day = true) => {
  const k = condKind(c),
    sun = day
      ? '<circle cx="12" cy="12" r="4.6" fill="var(--m-amber)"/><g class="rays" stroke="var(--m-amber)" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>'
      : '<path d="M15.5 3.5a8 8 0 1 0 5 11.8A6.5 6.5 0 0 1 15.5 3.5z" fill="var(--m-blue)"/>';
  const cloud = (x = 0, y = 0, f = 'var(--fg3)') =>
    `<g class="cld"><path transform="translate(${x} ${y})" d="M7 19h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1A4.5 4.5 0 0 0 7 19z" fill="${f}"/></g>`;
  const drops =
    '<g class="drp" stroke="var(--c-home)" stroke-width="1.8" stroke-linecap="round"><path d="M8 20.5l-1 2M12 20.5l-1 2M16 20.5l-1 2"/></g>';
  const flakes =
    '<g class="flk" fill="var(--c-home)"><circle cx="7.5" cy="21.5" r="1.2"/><circle cx="12" cy="22.3" r="1.2"/><circle cx="16.5" cy="21.5" r="1.2"/></g>';
  const g = {
    clear: sun,
    part: `<g transform="translate(-3 -3) scale(.8)">${sun}</g>${cloud(1.5, 1.5)}`,
    cloud: cloud(0, -1),
    rain: cloud(0, -3) + drops,
    snow: cloud(0, -3) + flakes,
    sleet:
      cloud(0, -3) +
      '<path d="M8 20.5l-1 2M16 20.5l-1 2" stroke="var(--c-home)" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="22" r="1.2" fill="var(--c-home)"/>',
    storm:
      cloud(0, -3) +
      '<path class="bolt" d="M12.5 15.5 10 20h3l-1.5 3.5" fill="none" stroke="var(--m-amber)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    fog:
      cloud(0, -4) +
      '<g class="fog" stroke="var(--fg3)" stroke-width="1.8" stroke-linecap="round"><path d="M4 18.5h16M6 21.5h12"/></g>',
    wind: '<g class="wnd" fill="none" stroke="var(--fg3)" stroke-width="1.9" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/></g>',
  }[k];
  return `<svg class="wxi" width="${sz}" height="${sz}" viewBox="0 0 24 24" role="img" aria-label="${esc(condName(c))}">${g}</svg>`;
};
/**
 * The legacy class, the shell's guest (spec 14, ADR 0016): it implements GuestRenderer structurally (src/shell/guest.ts;
 * this file may not import the shell). It is not an element: the shell constructs it, hands it the page, the store, the
 * API client and the settings in connect(), and draws nothing for it. It writes into the shell's `.guest` container and
 * nowhere else in the shell's root.
 */
export class LegacyPanel {
  // `root` (the shell's shadow root), `host` (the <home-panel> element) and `container` (the guest's container inside the
  // root) are set by connect(); so are the services the shell owns: `store`, `api` and `settings`.
  constructor() {
    // the zone, locale and hour cycle the browser prefers, which the core does not read itself
    this.browser = browserDefaults();
    // the formatter sets (spec 11), named by their language and zone, are built once the store is known (refreshFormatters):
    //   fmt      the profile's language, the house's zone: the five sites that were already French
    //   fmtEn    English, the house's zone: every other site, because the rewrite layer parses English (deleted in phase 4)
    //   fmtUtc   fmt pinned to UTC, and fmtUtcEn fmtEn pinned to UTC: for a day key parsed at UTC noon (dayAt)
    //            and for a clock time with no day (clockTime), neither of which belongs to any zone
    // fmtUtcEn never changes; the other three follow the profile (refreshFormatters)
    this.fmtUtcEn = createFormatters(englishLocale('UTC'));
    this.localeKey = '';
    this.frDrawn = false; // whether the panel was last drawn in French
    this.onStore = () => {
      this.refreshFormatters(); // before the render, which reads them
      this.tick();
    };
    this.unsubStore = null; // the one path to the one-second render, subscribed in connect
    this.shared = null; // the history the readers left in this panel share: the energy slices and the water heater's day (loadSharedHistory)
    this.sheetOffs = []; // what unregisters this draw's sheets from the shell's sheet host (build), run by teardown
    this.drawnTab = 'home'; // the tab the guest last drew its part of (tabChanged); `tab` is the shell's
    this.framed = false; // whether build() has drawn once, so the next draw asks the shell for a fresh frame
    this.frameKey = null; // what availability() said when the shell was last asked to draw the rail
    this.car = null; // the car's entities by the provider's rule (findCar), found once there are states: the stack and the Home tile read it through carInputs, until #269
    this.cache = {}; // last innerHTML per container, to skip identical updates
    this.pending = {}; // optimistic control states until hass catches up
    this.attentionCount = 0; // how many Status checks need attention, told by the shell from the live pill (liveChanged)
    this.liveRunning = false; // whether the live pill shows an activity, told by the shell (liveChanged): the weather chip slims beside it
    this.fc = {}; // forecasts by type, told by the shell (forecastChanged) from the Weather pane's subscription; Home's card reads them
    // #iwrap, the clock's container, is a static node of the shell's and outlives a draw: one listener, added at connect and removed at disconnect.
    // On the smart stack's card the tap that wakes the panel opens what the card is about
    this.onIdleClick = e => {
      const g = e.target.closest('[data-go]');
      if (g) this.stackGo(g.dataset.go);
    };
  }
  // connect, disconnect, hassChanged, panelChanged, tabChanged and compactChanged are the guest's interface (spec 14,
  // GuestRenderer): the shell feeds the store itself and calls them after it did.
  // The tab and the phone shape belong to the shell, which draws the rail, the bar and the panes from them
  get tab() {
    return this.ctx.shell.tab;
  }
  get compact() {
    return this.ctx.shell.compact;
  }
  // the shell's sheet host: which sheet is open, Escape, focus return and where the detail panels sit
  get sheets() {
    return this.ctx.shell.sheets;
  }
  // the shell fed the store the new config; draw again when it is a different one (configure)
  panelChanged() {
    if (this.hass && this.configure()) {
      this.build();
      if (this.host.isConnected) {
        this.refreshShared();
        this.observeLayout();
      }
      this.tick();
    }
  }
  /**
   * @returns {any} loose on purpose: the class reads registry fields (hidden, platform, manufacturer, entity_category)
   * that PanelHass does not declare; typing it as PanelHass gives 43 loose-pass errors. Spec 12 grows the hass types
   * to what the panel reads; the class itself goes with phase 3.
   */
  get hass() {
    return this.store.hass;
  }
  /** @param {import('./core/store.ts').HassChange} change what the store found different; the body still reads the store itself */
  // eslint-disable-next-line no-unused-vars -- the guest's signature; the body keeps reading the store until a move rewrites it
  hassChanged(change) {
    // French follows the user's profile language; switching it redraws the panel.
    // The store's locale change is not enough here: a host may set the new language on the hass object it already
    // handed over (the harness does, on its first switch), so the store sees the same language before and after.
    // Comparing with the language this panel was drawn in catches that too.
    const fr = this.store.isFrench;
    if (fr !== this.frDrawn) {
      this.frDrawn = fr;
      if (this.$app) this.teardown();
    }
    this.configure();
    if (!this.$app) this.build();
    if (!this.lightOrderAsked) {
      this.lightOrderAsked = true;
      this.loadLightOrder();
    }
  }
  // true when the store's config changed after the panel was drawn, so it must be drawn again; the store's generation
  // is the key (the shell fed the store the config, and the store counts its changes)
  configure() {
    const gen = this.store.generation;
    if (gen === this.generation) return false;
    this.generation = gen;
    if (!this.$app) return false;
    this.teardown();
    this.shared = null;
    return true; // the caller draws it again
  }
  // forget the drawn panel so build() starts over (the language or the config changed)
  teardown() {
    this.frStop();
    this.cache = {};
    this.sheetOffs.forEach(off => off()); // the sheets are about to be written again, and none is open
    this.sheetOffs = [];
    this.plan = null;
    this.$app = null;
    this.view = null;
  }
  /**
   * Once per connection of the host: take the root, the host and the services from the shell's context, then subscribe.
   * The shell calls hassChanged and panelChanged after this, which draw the panel the first time.
   * (A JSDoc type reference is no import for dependency-cruiser, so naming the shell's type here breaks no rule.)
   * @param {import('./shell/guest.ts').GuestContext} ctx
   */
  connect(ctx) {
    this.ctx = ctx;
    this.root = ctx.root;
    this.host = ctx.host;
    this.container = ctx.root.querySelector('.guest'); // the one container the class draws into
    this.store = ctx.store;
    this.api = ctx.api;
    this.settings = ctx.settings;
    if (!this.french) this.french = createFrench(this.store); // the French layer of this panel, read through its store
    if (!this.unsubStore) {
      this.refreshFormatters(); // a hass may have come before this connection, or while the panel was off the page
      this.unsubStore = this.store.subscribe('*', this.onStore);
    }
    this.clockT = setInterval(() => {
      this.renderHeader();
      this.renderIdle();
      this.renderHomeStack();
    }, 20000);
    this.histT = setInterval(() => this.refreshShared(), 15 * 60000);
    this.$('iwrap').addEventListener('click', this.onIdleClick);
    if (this.hass && this.$app) this.refreshShared();
    if (this.$app) this.observeLayout();
  }
  // repack the cards whenever the page width or a card's height changes
  observeLayout() {
    if (this.ro) this.ro.disconnect();
    this.ro = new ResizeObserver(() => {
      clearTimeout(this.layT);
      this.layT = setTimeout(() => this.layout(), 120);
    });
    this.ro.observe(this.root.querySelector('.cols'));
    LAYOUT.forEach(id => this.$(id) && this.ro.observe(this.$(id)));
  }
  disconnect() {
    if (this.ro) this.ro.disconnect();
    clearInterval(this.clockT);
    clearInterval(this.histT);
    this.$('iwrap').removeEventListener('click', this.onIdleClick);
    if (this.unsubStore) this.unsubStore();
    this.unsubStore = null;
  }
  // the store's reads: every call site goes through these; the house lives in this panel's store, not at module scope (spec 10)
  get E() {
    return this.store.config.entities;
  }
  get ROOMS() {
    return this.store.config.rooms;
  }
  get HOUSEHOLD() {
    return this.store.config.people;
  }
  get MODES() {
    return this.store.config.modes;
  }
  get AL_AREAS() {
    return this.store.config.alAreas;
  }
  get SPLIT_AREAS() {
    return this.store.config.splitLightAreas;
  }
  get LIGHT_LINKS() {
    return this.store.config.lightLinks;
  }
  get CFG() {
    return this.store.config;
  }
  st(id) {
    return this.store.state(id);
  }
  num(id) {
    return this.store.num(id);
  }
  /** @returns {any} the store returns unknown; the legacy class reads attributes it does not narrow (see get hass) */
  attr(id, a) {
    return this.store.attr(id, a);
  }
  /**
   * The name the panel shows for an entity, an area or a device, from the store's resolver. With a fallback, an id Home
   * Assistant has no name for (and the house did not name) shows the fallback instead of the id.
   * @param {string} key
   * @param {string} [fallback]
   */
  name(key, fallback) {
    return this.store.names.name(key, fallback);
  }
  kw(id) {
    return this.store.kw(id);
  }
  // the sun is up (or unknown)
  up() {
    const s = this.st(this.E.sun);
    return !s || s.state === 'above_horizon';
  }
  // ---------- time ----------
  // Rebuilds both formatter sets when the language, the time zone or the profile's formats changed. Compared by value, not
  // by the store's locale flag, because a host may change the language on the hass object it already handed over.
  refreshFormatters() {
    const hass = this.store.hass ?? /** @type {any} */ ({config: {}});
    const locale = panelLocale(hass, this.browser),
      key = JSON.stringify(locale);
    if (key === this.localeKey) return;
    this.localeKey = key;
    this.locale = locale;
    this.localeEn = englishLocale(locale.timeZone);
    this.fmt = createFormatters(this.locale);
    this.fmtEn = createFormatters(this.localeEn);
    this.fmtUtc = createFormatters({...locale, timeZone: 'UTC'}); // fmt for a day key, see the constructor
  }
  ago(t) {
    const m = Math.round((Date.now() - Date.parse(t)) / 6e4);
    return m < 1
      ? 'just now'
      : m < 60
        ? `${m} min ago`
        : m < 1440
          ? `${Math.round(m / 60)} h ago`
          : this.fmtEn.date(new Date(t));
  }
  $(id) {
    return this.root.getElementById(id);
  }
  css(n) {
    return getComputedStyle(this.$app).getPropertyValue(n).trim();
  }
  frStart() {
    this.frStop();
    const root = this.root;
    this.frObs = new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'childList') m.addedNodes.forEach(this.french.tree);
        else this.french.node(m.target);
      }
    });
    this.frObs.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: FR_ATTR,
    });
    this.french.tree(root);
  }
  frStop() {
    if (this.frObs) this.frObs.disconnect();
    this.frObs = null;
  }
  set(id, html) {
    const el = this.$(id);
    if (el && this.cache[id] !== html) {
      this.cache[id] = html;
      el.innerHTML = html;
    }
  }

  // ---------- skeleton ----------
  build() {
    ensureFonts(); // Montserrat from the panel's own fonts/ folder, declared in the document once
    // A second draw starts from new frame elements, as when the class wrote the frame itself: no listener it wired and no card it
    // moved into a pane survives. The shell renders them at once; the first draw finds the frame the shell rendered.
    if (this.framed) this.ctx.shell.resetFrame();
    this.framed = true;
    // the shell drew the frame (the header, the rail, the panes); the guest draws what is not in it: the parked cards, the sheets, the idle clock
    // (the Air card is <hp-air-card>, placed by the Air pane: `#open-air` and `#air` are empty legacy containers, kept until the Home move, #268)
    this.container.innerHTML = `<div class="cols">
    <div class="col c1"></div>
    <div class="col c2">
      <div class="card" id="lights"></div>
      <div class="card tap" id="open-air" tabindex="0" role="button" aria-description="Open air quality details"><div id="air"></div></div>
    </div>
  </div>

<div class="sheet" id="sh-light" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="lshh">
  <div class="ph"><button type="button" class="lpwr" id="lshpwr" role="switch" aria-checked="false" data-l="area" data-a="">${ico('lpow', 24)}</button><div class="grow"><h2 id="lshh"></h2><div class="sub" id="lshsub"></div></div><button class="close ldone" type="button">Done</button></div>
  <div class="lsbody" id="lsheet"></div>
</div></div>`;
    this.$app = this.$('app');
    // `.app` is the shell's and outlives a draw, where a fresh one used to start bare: clear what the guest toggles on it
    // (the shell owns the theme, the glass wallpaper, `gl`, `txl`, `live` and `idle`)
    this.$app.classList.remove('mc');
    this.theme = this.ctx.shell.appearance.theme;
    this.$app.lang = (this.store.isFrench ? this.locale : this.localeEn).tag;
    this.root
      .querySelectorAll('.sheet>.panel')
      .forEach(p => p.insertAdjacentHTML('afterbegin', '<div class="grab" aria-hidden="true"></div>'));
    if (this.store.isFrench) this.frStart();
    // the detail panels move into the tab panes in the Tabs view, so they are kept by id
    this.panels = {};
    this.root.querySelectorAll('.sheet').forEach(sh => {
      this.panels[sh.id] = sh.querySelector('.panel');
    });
    // The scenes row is Media's element, placed by its tag (the Home-card bridge, ADR 0024): written once a draw and never again, and
    // hidden while it says it has nothing, as the legacy row was. The Home move (#268) deletes the Home-card bridge and its hosts.
    const hs = this.$('hscenes');
    hs.innerHTML = '<hp-scene-tiles></hp-scene-tiles>';
    hs.addEventListener('hp-empty', e => {
      hs.hidden = e.detail.empty;
    });
    // The Security card is the second use, written the same way: its tag once a draw, and the card keeps its glow's memory (#226).
    this.$('hsec').innerHTML = '<hp-security-card></hp-security-card>';
    this.wire();
    // the host takes the scrim and the Close button of each sheet, and places the panels for the shape of the screen (none sits inline in its pane since #252; #188 deletes the placement)
    this.sheetOffs = [...this.root.querySelectorAll('.guest .sheet')].map(el =>
      this.sheets.registerLegacy({
        id: /** @type {import('./shell/sheet-host.ts').LegacySheetId} */ (el.id),
        element: el,
      }),
    );
    this.observeLayout();
    this.ctx.shell.idle.arm(); // a draw counts as a touch, as it did: the five minutes start over, and an idle panel wakes
    // the first render (setView → renderTabs) gates the Car tab and tile, so it must already know the car; renderLive looks again
    this.car ||= findCar(this.hass.states);
    this.setView();
    this.lensAll();
    this.refreshShared();
  }

  // ---------- layout: cards packed into the shortest column, so no column runs long ----------
  layout() {
    const box = this.root.querySelector('.cols');
    if (!box || !box.clientWidth) return;
    const w = box.clientWidth,
      n = w >= 1250 ? 3 : w >= 700 ? 2 : 1,
      gap = 18;
    const cols = [...box.querySelectorAll(':scope > .col')],
      cards = LAYOUT.map(id => this.$(id)).filter(Boolean),
      hs = cards.map(c => c.offsetHeight + gap);
    const tallest = plan => {
      const h = new Array(n).fill(0);
      plan.forEach((k, i) => {
        h[k] += hs[i];
      });
      return Math.max(...h);
    };
    const h = new Array(n).fill(0),
      plan = hs.map(v => {
        const k = h.indexOf(Math.min(...h));
        h[k] += v;
        return k;
      });
    box.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
    cols.forEach((c, i) => {
      c.style.display = i < n ? '' : 'none';
      c.style.gridColumn = 'auto';
      c.style.gridTemplateColumns = 'minmax(0, 1fr)';
    });
    // keep the current arrangement unless the new one is clearly shorter, so cards don't hop around on small changes
    const cur = this.plan && this.plan.n === n && this.plan.k.length === plan.length ? this.plan.k : null;
    if (cur && (cur.join() === plan.join() || tallest(cur) - tallest(plan) < 80)) return;
    this.plan = {n, k: plan};
    cards.forEach((c, i) => cols[plan[i]].appendChild(c));
  }

  // ---------- theme, glass and text size are the shell's (its AppearanceController); the guest hears of a change here ----------
  appearanceChanged(a) {
    if (!this.$app) return; // nothing drawn yet: the first draw reads the shell
    if (a.theme !== this.theme) {
      this.theme = a.theme;
      this.cache = {};
    }
    this.lensAll();
  }
  // Idle clock (v1.19.6): after 5 min without a touch the wall iPad shows a big clock with the date, the temperatures and the next sun event.
  // Since 2.2.0 the current outdoor condition's icon (day or night version) sits beside the time.
  // Any touch brings the panel back; the overlay swallows that first tap so nothing underneath gets pressed. Phones never go idle.
  // The shell's idle timer (src/shell/idle-timer.ts) decides when, draws the overlay and `.app.idle`, and tells the guest here;
  // "Sleep now" in the settings popup asks it through ctx.shell.idle. The guest draws the clock into #iwrap until the clock moves.
  idleChanged(idle) {
    if (!idle) return; // the shell took `.idle` off the frame already; the overlay fades out by itself
    this.cache.ishell = null;
    this.renderIdle();
  }
  renderIdle() {
    if (!this.$app || !this.hass || !this.$app.classList.contains('idle')) return;
    const now = new Date(),
      fr = this.store.isFrench;
    const t = fr ? [this.fmt.time24(now)] : this.fmtEn.time(now).split(' ');
    const dateStr = (fr ? this.fmt : this.fmtEn).dateLong(now),
      L = this.powerNow();
    const ins = L.rooms.map(r => r.temperature).filter(v => v != null),
      outT = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT);
    const cond = this.st(this.E.cond),
      w = this.st(this.E.weather),
      c = ok(cond) ? cond.state : ok(w) ? w.state : null;
    const temps = [
      ins.length ? `${(sum(ins) / ins.length).toFixed(1)}° inside` : '',
      outT == null ? '' : `${f1(outT)}° outside`,
    ]
      .filter(Boolean)
      .join(' · ');
    const icon = c ? `<span class="iwx">${wxIcon(c, 120, this.up())}</span>` : '';
    const ms = now.getTime(),
      d = this.sunDay(0),
      d1 = this.sunDay(1);
    const next = ms < d.rise ? ['Sunrise', d.rise] : ms < d.set ? ['Sunset', d.set] : ['Sunrise', d1.rise];
    const clock = `<div class="iclock num">${t[0]}<small>${t[1] || ''}</small></div>`;
    // smart stack (2.5.0): one contextual card beside the clock, picked by pickStack() from the cards that apply right now
    let pick = null;
    try {
      pick = this.CFG.stack.on ? pickStack(this.stackCards(), ms) : null;
    } catch (e) {
      console.error('home-panel stack', e);
    }
    const shell = pick ? 'ss' : 'solo';
    if (this.cache.ishell !== shell) {
      this.cache.ishell = shell;
      this.cache.iclk = this.cache.istk = null;
      this.$('iwrap').innerHTML = pick
        ? '<div class="ss"><div class="ssc" id="iclk"></div><div class="ssk" id="istk"></div></div>'
        : '<div id="iclk"></div>';
    }
    this.set(
      'iclk',
      `${icon ? `<div class="iclk2">${icon}${clock}</div>` : clock}<div class="idate">${esc(dateStr)}</div>${temps ? `<div class="itemps">${temps}</div>` : ''}${next[1] ? `<div class="isun">${next[0]} ${this.fmtEn.time(new Date(next[1]))}</div>` : ''}`,
    );
    if (pick)
      this.set(
        'istk',
        `<div class="scw">${pick.n > 1 ? '<div class="speek"></div>' : ''}${pick.card.html}</div>${pick.n > 1 ? `<div class="sdots" aria-hidden="true">${Array.from({length: pick.n}, (_, i) => `<i${i === pick.i ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}`,
      );
    // the block drifts a little on every tick so the OLED-less iPad still never shows the same pixels for hours
    const x = Math.round(Math.random() * 40 - 20),
      y = Math.round(Math.random() * 30 - 15);
    this.$('iwrap').style.transform = `translate(${x}px,${y}px)`;
  }
  // one smart stack card: a title row, a body and a footer line; go = where a tap on it leads
  scard(k, {ic, label, color, right = '', body = '', foot = '', tone = null, go = '', filler = false}) {
    const html = `<div class="sc${tone ? ' ' + tone : ''}" data-k="${k}"${go ? ` data-go="${esc(go)}"` : ''}><div class="sh"><span class="si" style="background:${color}">${ico(ic, 16)}</span><b>${esc(label)}</b>${right ? `<em>${esc(right)}</em>` : ''}</div>${body}${foot ? `<div class="sft">${esc(foot)}</div>` : ''}</div>`;
    return {k, tone, filler, html};
  }
  sring(pct, lim, color, size = 124) {
    const r = 52,
      c = 2 * Math.PI * r,
      a = (c * Math.max(0, Math.min(100, pct || 0))) / 100;
    return `<span class="sring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 124 124" aria-hidden="true"><circle cx="62" cy="62" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="11"/><circle cx="62" cy="62" r="${r}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${a.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 62 62)"/>${lim ? `<circle cx="62" cy="62" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".6" stroke-width="11" stroke-dasharray="1.6 ${c.toFixed(1)}" stroke-dashoffset="${((-c * lim) / 100).toFixed(1)}" transform="rotate(-90 62 62)"/>` : ''}</svg><b class="num">${pct == null ? '–' : Math.round(pct)}<small>%</small></b></span>`;
  }
  // every card that applies right now, red alerts and amber warnings first. No card ever reads camera motion.
  // Security's one read left in the legacy panel (#227): the provider's door and motion sensors over the store. Its
  // callers leave with the Status checks (#256, after #254 moves the rules), the legacy stack (#266) and the More word (the guest).
  doorSensors() {
    return doorMotionSensors(this.store.hass.states, registriesOf(this.store.hass), this.store.names);
  }
  // Air's one read left in the legacy panel (#234): the provider's rooms, each with its rating, over the store. Its callers
  // leave with the stack (#266) and the Home tile (#268).
  airRooms() {
    return milaRooms(this.store.hass.states, registriesOf(this.store.hass), this.store.names).map(room => ({
      room,
      rating: rateRoom(room),
    }));
  }
  // a pollutant's reading as the stack's air card and the Home tile said it (the feature words its own through the formatters)
  airFigure(k, v) {
    return v == null ? '–' : k === 'co' && v < 10 ? (+v).toFixed(1) : this.fmtEn.integer(v);
  }
  stackCards() {
    const now = Date.now(),
      h = this.fmtEn.hourNow(Date.now()),
      out = [],
      S = this.CFG.stack,
      mins = t => Math.round((now - Date.parse(t)) / 6e4);
    const when = t => {
      const d = Date.parse(t);
      return this.fmtEn.isoDay(d) === this.fmtEn.isoDay(now) ? this.fmtEn.time(d) : this.fmtEn.date(d);
    };
    const chips = names =>
      `<div class="schips">${names
        .slice(0, 3)
        .map(n => `<span>${esc(n)}</span>`)
        .join('')}${names.length > 3 ? `<span>+${names.length - 3}</span>` : ''}</div>`;
    const big = (v, u) => `<div class="sbig num">${v}${u ? `<small>${u}</small>` : ''}</div>`,
      mid = t => `<div class="smid">${esc(t)}</div>`;
    const doors = this.doorSensors().filter(x => x.kind === 'door');
    const areas = this.lightAreas();
    // red: a door open 5 min or more, lights that stopped answering for 5 min (pinned until fixed)
    // (x.since is the same instant as a number; mins and when take the state's ISO string, so the state is read again)
    doors
      .filter(x => x.on && mins(this.st(x.id).last_changed) >= 5)
      .forEach(x => {
        const m = mins(this.st(x.id).last_changed);
        out.push(
          this.scard('door', {
            ic: 'door',
            label: `${x.name} open`,
            color: 'var(--crit)',
            tone: 'red',
            go: 'sens:' + x.id,
            body:
              m < 60
                ? big(m, ' min')
                : big(Math.floor(m / 60), ' h') + mid(`Open since ${when(this.st(x.id).last_changed)}`),
            foot: 'Stays here until the door closes',
          }),
        );
      });
    const lost = areas.filter(a =>
      a.ids.some(id => {
        const s = this.st(id);
        return s && s.state === 'unavailable' && mins(s.last_changed) >= 5;
      }),
    );
    if (lost.length) {
      const ids = lost.flatMap(a => a.ids.filter(id => (this.st(id) || {}).state === 'unavailable')),
        first = ids.map(id => Date.parse(this.st(id).last_changed)).sort()[0];
      out.push(
        this.scard('lights', {
          ic: 'bulb',
          label: 'Lights unreachable',
          color: 'var(--crit)',
          right: 'since ' + when(first),
          tone: 'red',
          go: 'tab:lights',
          body: big(ids.length, ids.length === 1 ? ' light' : ' lights') + chips(lost.map(a => a.name)),
          foot: 'They are not answering Home Assistant',
        }),
      );
    }
    // amber: a weather warning, the car low and unplugged at night, phones that stopped updating
    const warn = this.alerts().filter(a => a.kind === 'Warning');
    if (warn.length)
      out.push(
        this.scard('wxwarn', {
          ic: 'warn',
          label: warn[0].title,
          color: 'var(--warn)',
          tone: 'amber',
          go: 'weather.detail',
          right: 'Env. Canada',
          body: mid(warn.length > 1 ? `${warn.length} warnings in effect` : 'In effect for your area'),
          foot: warn[0].time ? `Issued ${when(warn[0].time)}` : 'Tap for the details',
        }),
      );
    const C = this.carInputs();
    if (C && C.home !== false && !C.plugged && C.soc != null && C.soc < 40 && inHours(h, 21, 6))
      out.push(
        this.scard('carlow', {
          ic: 'car',
          label: `${C.name || 'Car'} not plugged in`,
          color: 'var(--warn)',
          tone: 'amber',
          go: 'car.detail',
          body: `<div class="srow">${this.sring(C.soc, 0, 'var(--warn)', 108)}<div class="skv">${C.range != null ? `<div><small>Range</small><b class="num">${Math.round(C.range)} km</b></div>` : ''}</div></div>`,
          foot: 'Plug in before bed',
        }),
      );
    const reg = this.hass.entities || {};
    const frozen = Object.keys(this.hass.states)
      .filter(id => id.startsWith('person.'))
      .map(id => this.attr(id, 'source'))
      .filter(Boolean)
      .filter(t => (reg[t] || {}).platform === 'icloud' && ok(this.st(t)) && mins(this.st(t).last_updated) >= 180);
    if (frozen.length)
      out.push(
        this.scard('presence', {
          ic: 'house',
          label: 'Presence not updating',
          color: 'var(--warn)',
          tone: 'amber',
          right: 'since ' + when(this.st(frozen[0]).last_updated),
          body: mid(`${plural(frozen.length, 'iPhone')} stopped updating. Who's home and Away may be wrong.`),
          foot: 'Sign in to iCloud again in Settings',
        }),
      );
    // the hour before sunrise
    const d0 = this.sunDay(0),
      rise = now < d0.rise ? d0.rise : this.sunDay(1).rise,
      left = (rise - now) / 6e4;
    if (rise && left > 0 && left <= 60) {
      const on = areas.filter(a => a.ids.some(id => (this.st(id) || {}).state === 'on')).map(a => a.name);
      if (!S.sunriseOff || on.length)
        out.push(
          this.scard('sunrise', {
            ic: 'sunup',
            label: S.sunriseOff ? 'Lights off at sunrise' : 'Sunrise',
            color: 'var(--m-amber)',
            go: 'tab:lights',
            body:
              big(
                ...this.fmtEn
                  .time(rise)
                  .split(' ')
                  .map((x, i) => (i ? ' ' + x : x)),
              ) +
              mid(`in ${Math.round(left)} min`) +
              (on.length ? chips(on) : ''),
            foot: on.length ? (S.sunriseOff ? 'Every light turns off then' : 'Lights still on') : 'Every light is off',
          }),
        );
    }
    // reminders from the config (a child's bedtime, say)
    (S.reminders || []).forEach((r, i) => {
      const m = reminderLeft(r, h);
      if (m == null) return;
      out.push(
        this.scard('rem' + i, {
          ic: 'moon',
          label: r.title,
          color: 'var(--m-purple)',
          body:
            big(
              ...this.fmtEn
                .time(Date.now() + m * 6e4)
                .split(' ')
                .map((x, j) => (j ? ' ' + x : x)),
            ) + (r.text ? mid(r.text) : ''),
          foot: `in ${m} min`,
        }),
      );
    });
    // Hydro-Québec critical peaks and Hilo challenges
    const hq = this.hydroQuebec(),
      defi = this.hiloChallenge(),
      L = this.powerNow();
    // the grid's reading as these two cards said it: watts under a kilowatt, one decimal above; the legacy English, which leaves with the
    // stack's peak cards (#265), when the model words the figure
    const using = () => {
      const g = L.grid;
      return `Using ${g == null ? '–' : g < 1 ? Math.round(g * 1000) + ' W' : g.toFixed(1) + ' kW'} right now`;
    };
    if (hq && (hq.peakNow || hq.peakUpcoming))
      out.push(
        this.scard('peak', {
          ic: 'bolt',
          label: hq.peakNow ? 'Critical peak now' : 'Critical peak coming',
          color: 'var(--crit)',
          right: 'Hydro-Québec',
          go: 'energy.detail',
          body: mid(hq.peakNow ? 'Lower consumption now' : 'Hydro-Québec announced a critical peak'),
          foot: using(),
        }),
      );
    else if (defi && defi.active)
      out.push(
        this.scard('peak', {
          ic: 'bolt',
          label: 'Hilo challenge',
          color: 'var(--crit)',
          right: 'Hilo',
          go: 'energy.detail',
          body: mid(String(defi.state)),
          foot: using(),
        }),
      );
    // a HomePod playing
    const sp = this.speakers().find(x => (this.st(x.id) || {}).state === 'playing');
    if (sp) {
      const pic = this.attr(sp.id, 'entity_picture'),
        area = this.areaName(sp.aid, sp.name);
      out.push(
        this.scard('music', {
          ic: 'spk',
          label: 'Now playing',
          color: 'var(--m-purple)',
          right: area,
          go: 'tab:media',
          body: `<div class="snp">${pic ? `<img src="${esc(pic)}" alt="">` : '<span class="sart"></span>'}<div><b>${esc(this.attr(sp.id, 'media_title') || 'Playing')}</b><small>${esc(this.attr(sp.id, 'media_artist') || this.attr(sp.id, 'app_name') || '')}</small></div></div>`,
          foot: 'Tap for the player',
        }),
      );
    }
    // someone came or left in the last 30 min
    const P = this.presence(),
      pe = id => {
        const s = this.st(id);
        return s && s.last_changed;
      };
    const pid = n =>
      Object.keys(this.hass.states).find(
        id => id.startsWith('person.') && fold(this.attr(id, 'friendly_name') || '').split(/\s+/)[0] === fold(n),
      );
    const moved = P.map(p => ({...p, at: pe(pid(p.name))})).filter(p => p.at);
    const who = () => {
      const dr = doors
        .filter(x => this.st(x.id) && mins(this.st(x.id).last_changed) <= 30 && (this.st(x.id) || {}).state === 'off')
        .sort((a, b) => Date.parse(this.st(b.id).last_changed) - Date.parse(this.st(a.id).last_changed))[0];
      return {
        ic: 'house',
        label: "Who's home",
        color: 'var(--m-orange)',
        body: `<div class="spl">${moved.map(p => `<div class="sp"><span class="sav${p.home ? '' : ' away'}">${esc(p.name.charAt(0))}</span><div><b>${esc(p.name)}</b><small>${p.home ? 'Arrived' : 'Left'} ${when(p.at)}</small></div><span class="stag${p.home ? ' ok' : ''}">${p.home ? 'Home' : 'Away'}</span></div>`).join('')}</div>`,
        foot: dr ? `${dr.name} opened ${when(this.st(dr.id).last_changed)}` : '',
      };
    };
    if (moved.some(p => mins(p.at) <= 30)) out.push(this.scard('who', who()));
    // today's calendar events, in the morning
    if (inHours(h, 6, 11)) {
      const today = this.fmtEn.isoDay(now),
        ev = Object.keys(this.hass.states)
          .filter(id => id.startsWith('calendar.') && !(reg[id] || {}).hidden && ok(this.st(id)))
          .map(id => ({id, a: this.st(id).attributes}))
          .filter(
            x =>
              x.a.start_time &&
              this.fmtEn.isoDay(Date.parse(String(x.a.start_time).replace(' ', 'T'))) === today &&
              Date.parse(String(x.a.end_time || x.a.start_time).replace(' ', 'T')) > now,
          )
          .sort((x, y) => String(x.a.start_time).localeCompare(String(y.a.start_time)));
      if (ev.length)
        out.push(
          this.scard('agenda', {
            ic: 'cal',
            label: 'Today',
            color: 'var(--crit)',
            right: plural(ev.length, 'event'),
            body: ev
              .slice(0, 2)
              .map(
                (x, i) =>
                  `<div class="sev"><i style="background:var(--${['c-home', 'm-purple'][i]})"></i><div><b>${esc(x.a.message || this.name(x.id))}</b><small class="num">${x.a.all_day ? 'All day' : this.fmtEn.time(Date.parse(String(x.a.start_time).replace(' ', 'T')))}</small></div></div>`,
              )
              .join(''),
            foot: ev.length > 2 ? `and ${ev.length - 2} more` : 'From your calendars',
          }),
        );
    }
    // Away mode
    const aw = this.st(this.E.away);
    if (aw && aw.state === 'on') {
      const on = areas.filter(a => a.ids.some(id => (this.st(id) || {}).state === 'on')).length,
        ins = L.rooms.map(r => r.temperature).filter(v => v != null);
      out.push(
        this.scard('away', {
          ic: 'shield',
          label: 'Away',
          color: 'var(--c-home)',
          right: 'since ' + when(aw.last_changed),
          body:
            (ins.length ? big((sum(ins) / ins.length).toFixed(1) + '°', ' inside') : '') +
            mid(on ? `${plural(on, 'light')} on` : 'All lights off'),
          foot: 'Ends when someone comes home',
        }),
      );
    }
    // a room whose air turned poor
    this.airRooms().forEach(({room, rating}) => {
      const bad = rating.pollutants.find(p => p.level >= 2);
      if (!bad) return;
      const [name, unit] = AIR_WORDS[bad.k];
      out.push(
        this.scard('air', {
          ic: 'wind',
          label: `${room.name} air`,
          color: 'var(--m-teal)',
          go: 'air.detail',
          body: big(this.airFigure(bad.k, bad.v), ' ' + unit) + mid(`${name} is high`),
          foot: bad.k === 'co2' ? 'Open a door or a window a little' : 'The purifier can run faster',
        }),
      );
    });
    // tomorrow's weather, in the evening
    if (inHours(h, 17, 24)) {
      const days = this.wxDays(),
        tm = days.find(x => x.k === this.fmtEn.isoDay(now + 864e5)),
        tn = days.find(x => x.k === this.fmtEn.isoDay(now));
      if (tm && (tm.hi != null || tm.lo != null))
        out.push(
          this.scard('tomorrow', {
            ic: 'cal',
            label: 'Tomorrow',
            color: 'var(--c-home)',
            right: this.dayName(tm.k, false) === 'Tomorrow' ? this.fmtUtcEn.weekday(dayAt(tm.k), 'long') : '',
            go: 'weather.detail',
            body: `<div class="swx">${wxIcon(tm.cond, 76, true)}<div>${big(tm.hi != null ? Math.round(tm.hi) + '°' : '–', tm.lo != null ? ' / ' + Math.round(tm.lo) + '°' : '')}${mid(condName(tm.cond) + (tm.pop ? `, ${Math.round(tm.pop)}%` : ''))}</div></div>`,
            foot:
              tn && tn.night
                ? `Tonight: ${condName(tn.night)}${tn.lo != null ? `, low ${Math.round(tn.lo)}°` : ''}`
                : '',
          }),
        );
    }
    // the car charging overnight
    if (C && C.plugged && C.home !== false && inHours(h, 21, 7)) {
      const p = this.kw(this.E.evP),
        dep = (this.st(this.car.id('switch', 'departuretimes')) || {}).state === 'on' ? this.schedText() : '';
      out.push(
        this.scard('car', {
          ic: 'car',
          label: C.name || 'Car',
          color: 'var(--c-ev)',
          right: C.charging ? 'Charging' : 'Plugged in',
          go: 'car.detail',
          body: `<div class="srow">${this.sring(C.soc, C.limit, 'var(--ok)')}<div class="skv">${p != null && p > 0.05 ? `<div><small>Power</small><b class="num">${p.toFixed(1)} kW</b></div>` : ''}${C.range != null ? `<div><small>Range</small><b class="num">${Math.round(C.range)} km</b></div>` : ''}${C.limit ? `<div><small>Limit</small><b class="num">${C.limit}%</b></div>` : ''}</div></div>`,
          foot:
            dep && !/^No /.test(dep)
              ? `Departure: ${dep.replace(/ saved\.$/, '')}`
              : C.charging
                ? `Charging to ${C.limit || 100}%`
                : 'Not charging right now',
        }),
      );
    }
    // fillers, when nothing else applies: energy used today in the daytime, and who's home
    const T = this.shared && this.shared.totals,
      F = this.shared && this.shared.flow;
    if (T && T.today != null && inHours(h, 8, 21)) {
      const td = (F || []).filter(r => this.fmtEn.isoDay(r[0]) === this.fmtEn.isoDay(now));
      const part = [3, 2, 1, 4].map(i => sum(td.map(r => r[i]))),
        tot = sum(part) || 1,
        col = ['var(--c-heat)', 'var(--c-wh)', 'var(--c-ev)', 'var(--fg3)'];
      out.push(
        this.scard('energy', {
          ic: 'bolt',
          label: 'Energy today',
          color: 'var(--m-orange)',
          right: 'so far',
          go: 'energy.detail',
          filler: true,
          body:
            big(f1(T.today), ' kWh') +
            (td.length
              ? `<div class="sbar">${part.map((v, i) => (v > 0 ? `<i style="flex:${((v / tot) * 100).toFixed(1)};background:${col[i]}"></i>` : '')).join('')}</div>`
              : ''),
          foot: td.length
            ? ['Heating', 'water', 'car'].map((n, i) => `${n} ${Math.round((part[i] / tot) * 100)}%`).join(' · ')
            : '',
        }),
      );
    }
    if (moved.length && inHours(h, 7, 22) && !out.some(c => c.k === 'who'))
      out.push({...this.scard('who', who()), filler: true});
    return out;
  }
  // the smart stack inside the Home card on a tablet (2.9.0): same cards and turns as beside the idle clock, minus the who's-home filler
  // that the Who's home chips right above it already show. Nothing to show: the slot hides.
  renderHomeStack() {
    const el = this.$('hstk');
    if (!el || this.compact || this.tab !== 'home') return;
    let pick = null;
    try {
      pick = this.CFG.stack.on
        ? pickStack(
            this.stackCards().filter(c => !(c.k === 'who' && c.filler)),
            Date.now(),
          )
        : null;
    } catch (e) {
      console.error('home-panel home stack', e);
    }
    el.hidden = !pick;
    if (pick)
      this.set(
        'hstk',
        `<div class="scw">${pick.card.html}</div>${pick.n > 1 ? `<div class="sdots" aria-hidden="true">${Array.from({length: pick.n}, (_, i) => `<i${i === pick.i ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}`,
      );
  }
  // a tap on the stack's card wakes the panel and opens what the card is about
  stackGo(go) {
    if (go.startsWith('sens:')) return this.sheets.open('security.history', {id: go.slice(5)}); // Security's sheet (#225); the legacy stack goes with #266
    if (go.startsWith('tab:')) {
      const t = go.slice(4);
      if (this.availability()[t] !== false) this.ctx.shell.setTab(t);
      return;
    }
    if (go.includes('.') || this.$(go)) this.sheets.open(go);
  }
  // Mercury drop (v1.19.0): Chromium bends the backdrop of every glass surface with a blurred fractal-noise displacement map (the Aether CSS
  // "glass-distortion" filter, referenced from glass.css through the mc class). WebKit drops url() filters, so it keeps the frosted glass from the CSS
  lensAll() {
    const {glass, reducedTransparency} = this.ctx.shell.appearance,
      on = glass.on && LENS_OK && !reducedTransparency;
    if (!this.lensSvg) {
      this.lensSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.lensSvg.setAttribute('aria-hidden', 'true');
      this.lensSvg.style.cssText = 'position:absolute;width:0;height:0';
      this.container.appendChild(this.lensSvg);
      this.lensSvg.innerHTML =
        '<filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise"/><feGaussianBlur in="noise" stdDeviation="2" result="blurred"/><feDisplacementMap in="SourceGraphic" in2="blurred" scale="150" xChannelSelector="R" yChannelSelector="G"/></filter>';
    }
    this.$app.classList.toggle('mc', on);
  }

  // ---------- events ----------
  wire() {
    this.$('hwx').addEventListener('click', e => {
      const g = e.target.closest('.hstk [data-go]');
      if (g) {
        e.stopPropagation();
        this.stackGo(g.dataset.go);
      }
    });
    this.$('menu').addEventListener('click', () =>
      this.host.dispatchEvent(new Event('hass-toggle-menu', {bubbles: true, composed: true})),
    );
    [
      ['open-air', 'air.detail'], // dead until the Home move (#268): the card is empty and parked
    ].forEach(([b, s]) => {
      const el = this.$(b);
      el.addEventListener('click', () => this.sheets.open(s));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.sheets.open(s);
        }
      });
    });
    this.root.querySelectorAll('.sheet').forEach(sh => this.swipeToClose(sh.querySelector('.panel'), sh.id));
    this.root.addEventListener('click', e => {
      // a tap outside the Status popup closes it (the shell keeps it); a tap on the pill stops at the pill
      if (!e.composedPath().some(n => n instanceof Element && n.localName === 'hp-status-popup'))
        this.ctx.shell.closeStatus();
      const sp = this.$('setpop');
      if (!sp.hidden && !e.composedPath().some(n => n === sp || n === this.$('gear'))) this.ctx.shell.closeSettings();
    });
    // the light sheet's two tall sliders (Apple Home style): the finger's height is the value, a tap jumps there,
    // the arrows step it; nothing re-renders while one is held, and the value goes out on release
    const sh = this.$('sh-light');
    const lpVal = (p, y) => {
      const b = p.getBoundingClientRect();
      return Math.max(0, Math.min(1, (b.bottom - y) / b.height));
    };
    const lpPaint = (p, f) => {
      const box = p.closest('.lpc'),
        out = box && box.querySelector('.lpv b');
      if (p.dataset.lp === 'br') {
        const v = Math.round(f * 100);
        p.style.setProperty('--v', v + '%');
        p.classList.toggle('off', !v);
        p.setAttribute('aria-valuenow', v);
        p.setAttribute('aria-valuetext', v ? v + '%' : 'Off');
        if (out) out.textContent = v ? v + '%' : 'Off';
        return v;
      }
      const lo = +p.dataset.min,
        hi = +p.dataset.max,
        k = Math.round((lo + f * (hi - lo)) / 50) * 50;
      p.style.setProperty('--v', (((k - lo) / (hi - lo)) * 100).toFixed(1) + '%');
      p.classList.remove('night');
      p.setAttribute('aria-valuenow', k);
      p.setAttribute('aria-valuetext', k + ' K');
      if (out) out.textContent = k + ' K';
      return k;
    };
    /** @type {{p: any, id: number, v?: any} | null} */
    let lp = null;
    sh.addEventListener('pointerdown', e => {
      const p = e.target.closest('.lpill[data-lp]');
      if (!p || p.getAttribute('aria-disabled') === 'true' || e.button > 0) return;
      e.preventDefault();
      lp = {p, id: e.pointerId};
      this.lightDrag = true;
      p.classList.add('drag');
      try {
        p.setPointerCapture(e.pointerId);
      } catch {}
      lp.v = lpPaint(p, lpVal(p, e.clientY));
    });
    sh.addEventListener('pointermove', e => {
      if (lp && e.pointerId === lp.id) {
        e.preventDefault();
        lp.v = lpPaint(lp.p, lpVal(lp.p, e.clientY));
      }
    });
    const lpEnd = e => {
      if (!lp || e.pointerId !== lp.id) return;
      const x = lp;
      lp = null;
      x.p.classList.remove('drag');
      if (e.type === 'pointerup') this.lightCmd(x.p.dataset.lp, x.p.dataset.a, x.v);
      setTimeout(() => {
        this.lightDrag = false;
        this.tick();
      }, 60);
    };
    sh.addEventListener('pointerup', lpEnd);
    sh.addEventListener('pointercancel', lpEnd);
    sh.addEventListener('keydown', e => {
      const p = e.target.closest('.lpill[data-lp]');
      if (!p || p.getAttribute('aria-disabled') === 'true') return;
      const dir = {ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1}[e.key];
      if (!dir) return;
      e.preventDefault();
      const br = p.dataset.lp === 'br',
        now = +p.getAttribute('aria-valuenow') || 0;
      const f = br
        ? Math.max(0, Math.min(100, now + dir * 10)) / 100
        : (Math.max(+p.dataset.min, Math.min(+p.dataset.max, now + dir * 100)) - p.dataset.min) /
          (p.dataset.max - p.dataset.min);
      this.lightCmd(p.dataset.lp, p.dataset.a, lpPaint(p, f));
    });
    // every light button (tiles, sheet switches, chips, the link picker) goes through lightCmd
    for (const lt of [this.$('lights'), this.$('ltiles'), sh])
      lt.addEventListener('click', e => {
        const b = e.target.closest('button[data-l]');
        if (b && !b.disabled) this.lightCmd(b.dataset.l, b.dataset.a ?? b.dataset.id, b.dataset.al);
      });
    // dimmer rows: a sideways slide dims (relative to where the fill was), an up-down move scrolls the page as usual,
    // and the brightness goes out on release; a linked pair's two rows move together while sliding
    // Arrange: drag whole rows (a linked pair as one block) into the order you want; it's saved for every screen
    this.$('ledit').addEventListener('click', () => this.setLightEdit(!this.lightEdit));
    this.$('lreset').addEventListener('click', () => {
      this.saveLightOrder(null);
      this.tick();
    });
    for (const lt of [this.$('lights'), this.$('ltiles')]) {
      let m = null;
      const box = () => (lt.id === 'ltiles' ? lt : lt.querySelector('.lrows'));
      const unitOf = (b, n) => b && [...b.children].find(c => c.contains(n));
      const keys = b =>
        [...b.children]
          .map(c => (c.matches('.lcell') ? c : c.querySelector('.lcell')))
          .filter(Boolean)
          .map(r => r.dataset.lsheet);
      const save = b => {
        const k = keys(b);
        if (
          JSON.stringify(k) !==
          JSON.stringify(
            this.lightAreas()
              .filter(x => !x.link || x.link.first)
              .map(x => x.aid),
          )
        )
          this.saveLightOrder(k);
      };
      lt.addEventListener('pointerdown', e => {
        if (!this.lightEdit || e.button > 0) return;
        const b = box(),
          u = unitOf(b, e.target);
        if (!u) return;
        e.preventDefault();
        const r = u.getBoundingClientRect();
        m = {u, b, id: e.pointerId, gx: e.clientX - r.left, gy: e.clientY - r.top};
        this.lightDrag = true;
        u.classList.add('lifted');
        try {
          u.setPointerCapture(e.pointerId);
        } catch {}
      });
      lt.addEventListener('pointermove', e => {
        if (!m || e.pointerId !== m.id) return;
        e.preventDefault();
        // the row under the finger takes the dragged one's place
        const over = unitOf(m.b, this.root.elementFromPoint(e.clientX, e.clientY));
        if (over && over !== m.u) {
          const k = [...m.b.children],
            i = k.indexOf(m.u),
            j = k.indexOf(over);
          m.b.insertBefore(m.u, j > i ? over.nextSibling : over);
        }
        m.u.style.transform = '';
        const r = m.u.getBoundingClientRect();
        m.u.style.transform = `translate(${e.clientX - m.gx - r.left}px,${e.clientY - m.gy - r.top}px)`;
        // near the top or bottom of the screen the page scrolls along
        if (e.clientY < 70) window.scrollBy(0, -12);
        else if (e.clientY > innerHeight - 90) window.scrollBy(0, 12);
      });
      const drop = e => {
        if (!m || e.pointerId !== m.id) return;
        const x = m;
        m = null;
        x.u.style.transform = '';
        x.u.classList.remove('lifted');
        save(x.b);
        setTimeout(() => {
          this.lightDrag = false;
          this.tick();
        }, 60);
      };
      lt.addEventListener('pointerup', drop);
      lt.addEventListener('pointercancel', drop);
      // while arranging, taps don't switch lights or open sheets, and the arrow keys move the focused row
      lt.addEventListener(
        'click',
        e => {
          if (this.lightEdit && e.target.closest('.lrows > *, #ltiles > *')) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true,
      );
      lt.addEventListener(
        'keydown',
        e => {
          if (!this.lightEdit) return;
          const b = box(),
            u = unitOf(b, e.target),
            step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key];
          if (!u || !step) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          const k = [...b.children],
            i = k.indexOf(u),
            j = i + step;
          if (j < 0 || j >= k.length) return;
          b.insertBefore(u, step > 0 ? k[j].nextSibling : k[j]);
          /** @type {HTMLElement} */ (e.target).focus();
          save(b);
        },
        true,
      );
    }
    // light tiles: Enter or Space opens the room, like a tap (the bulb inside is its own button)
    for (const lt of [this.$('lights'), this.$('ltiles')])
      lt.addEventListener('keydown', e => {
        const c = e.target.closest('.lcell');
        if (!c || e.target !== c || this.lightEdit || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        this.openLight(c.dataset.lsheet);
      });
    // Tabs view: the rail and the glance tiles switch panes; scenes and speakers work as on the phone view
    const tv = this.$('tabview');
    this.$('pane-auto').addEventListener('click', e => {
      const r = e.target.closest('[data-run]'),
        c = e.target.closest('[data-au]'),
        x = e.target.closest('[data-auclose]');
      if (!r && !c && !x) return;
      this.auSel = x ? null : r ? {item: r.dataset.item, run: r.dataset.run} : {item: c.dataset.au, run: null};
      this.cache.auhost = null;
      this.auLoad(true);
      this.renderAuto();
      if (!x) {
        const h = this.$('auhost');
        const card = h && h.querySelector('.ausel');
        if (card) card.scrollIntoView({behavior: 'smooth', block: 'start'});
      }
    });
    const onTap = e => {
      if (e.target.closest('button[data-l]')) return; // light switches on the phone rows: the lights listener has them
      // phone: tiles open sheets
      const sh = e.target.closest('[data-opens]');
      if (sh) return this.sheets.open(sh.dataset.opens);
      const ls = e.target.closest('[data-lsheet]');
      if (ls) return this.openLight(ls.dataset.lsheet);
      const t = e.target.closest('[data-pane]');
      if (t) return this.ctx.shell.setTab(t.dataset.pane);
    };
    tv.addEventListener('click', onTap);
  }

  // The shell draws the toast (<hp-toast>, #275): this asks for one as an element does, with a `ToastEvent`'s shape (the legacy code may
  // not import the kit), in French when the panel is, as the rewrite layer made it of the light DOM. Deleted with the guest (#277).
  toast(msg, sticky) {
    this.container.dispatchEvent(
      new CustomEvent('toast', {
        bubbles: true,
        composed: true,
        detail: {message: this.french.text(msg), sticky: !!sticky},
      }),
    );
  }
  // on a phone a sheet is dragged down by its grabber or its title to close, as iOS sheets are; a short drag springs back
  // (the kit's SwipeToClose is the same drag for the sheets that are elements; this one goes with the last legacy sheet, #169)
  swipeToClose(p, id) {
    let d = null;
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.y,
        fast = dy / Math.max(1, Date.now() - d.t) > 0.5,
        go = d.on && (dy > 80 || (fast && dy > 24));
      d = null;
      p.classList.remove('dragging');
      if (go) {
        p.style.transform = `translateY(${p.offsetHeight}px)`;
        setTimeout(() => {
          p.style.transform = '';
          this.sheets.close(id); // a sheet already closed by something else is left alone
        }, 180);
      } else p.style.transform = '';
    };
    p.addEventListener('pointerdown', e => {
      if (!this.compact || e.button || !e.target.closest('.grab, .ph>.badge, .ph>.grow')) return;
      d = {y: e.clientY, t: Date.now(), id: e.pointerId, on: false};
      try {
        p.setPointerCapture(e.pointerId);
      } catch {}
    });
    p.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.y;
      if (!d.on) {
        if (dy > 6) {
          d.on = true;
          p.classList.add('dragging');
        } else return;
      }
      p.style.transform = `translateY(${Math.max(0, dy)}px)`;
    });
    p.addEventListener('pointerup', end);
    p.addEventListener('pointercancel', end);
  }
  async call(domain, service, data, done) {
    try {
      await this.api.runService(domain, service, data);
      if (done) this.toast(done);
    } catch (e) {
      this.toast(`Didn't work: ${e.message || e.code || e}`, true);
      this.pending = {};
    }
  }

  // ---------- live rendering, throttled ----------
  tick() {
    if (this.tickQ) return;
    const wait = Math.max(0, 1000 - (Date.now() - (this.lastTick || 0)));
    this.tickQ = setTimeout(() => {
      this.tickQ = null;
      this.lastTick = Date.now();
      this.renderLive();
    }, wait);
  }
  renderLive() {
    if (!this.hass) return;
    this.car ||= findCar(this.hass.states);
    for (const f of ['renderHeader', 'renderLights']) {
      try {
        this[f]();
      } catch (e) {
        console.error('home-panel', f, e);
      }
    }
    this.renderTabs();
    try {
      if (this.sheets.isOpen('sh-light')) this.renderLightSheet();
    } catch (e) {
      console.error('home-panel sheet', e);
    }
  }

  // ---------- live values ----------
  // Energy's reads left in the legacy panel (#241): the providers over the store, in kW, each reader taking the fields it needs
  // (the provider words nothing). Their callers leave with the peak chip (#257), the stack (#265, #266),
  // the Home tiles (#268), the header (#269) and the More word (the guest).
  powerNow() {
    return powerNow(this.store.hass?.states ?? {}, this.store.config);
  }
  hiloRates() {
    return hiloRates(this.store.hass?.states ?? {}, this.store.config);
  }
  hiloChallenge() {
    return hiloChallenge(this.store.hass?.states ?? {}, this.store.config);
  }
  hydroQuebec() {
    return hydroQuebec(this.store.hass?.states ?? {}, this.store.config);
  }

  renderHeader() {
    const h = this.fmtEn.hourNow(Date.now()),
      part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = ((this.hass.user && this.hass.user.name) || '')
      .split(' ')[0]
      .replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    // on a phone the Home pane has no title line of its own, so the header carries what it said: the date, inside and outside
    const dateStr = this.fmtEn.dateLong(new Date()),
      L0 = this.compact ? this.powerNow() : null;
    const ins = L0 ? L0.rooms.map(r => r.temperature).filter(v => v != null) : [],
      outT = this.compact ? (this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT)) : null;
    const sub = [
      dateStr,
      ins.length ? `${(sum(ins) / ins.length).toFixed(1)}° inside` : '',
      outT == null ? '' : `${f1(outT)}° outside`,
    ]
      .filter(Boolean)
      .join(' · ');
    this.set(
      'hello',
      `<h1>${part}${name ? `, <span style="white-space:nowrap">${esc(name)}</span>` : ''}</h1><div>${sub}</div>${this.whoHtml()}`,
    );
    const t = this.store.isFrench ? [this.fmt.time24(new Date())] : this.fmtEn.time(new Date()).split(' ');
    this.set(
      'clock',
      `${t[0]}<span style="font-size:.45em;margin-left:4px">${t[1] || ''}</span><small>${this.shared ? 'Live · history ' + this.fmtEn.time(this.shared.at) : 'Live · loading history'}</small>`,
    );
    const temp = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT),
      cond = this.st(this.E.cond);
    const chips = [];
    if (temp != null)
      chips.push(
        `<div class="chip wxchip${this.liveRunning ? ' slim' : ''}"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="4" fill="var(--m-amber)"/><path d="M8 19h9a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.6A3.2 3.2 0 0 0 8 19z" fill="var(--fg3)" opacity=".7"/></svg><span class="num">${f1(temp)}°</span><small>${esc(condName(ok(cond) ? cond.state : (this.st(this.E.weather) || {}).state))}</small></div>`,
      );
    if (this.hydroQuebec()?.peakNow)
      chips.push(`<div class="chip"><span class="dot" style="background:var(--crit)"></span>Critical peak now</div>`);
    // the live pill after these is the feature's <hp-live-pill>, which the shell places (#256)
    this.set('wxchip-host', chips.join(''));
  }

  // ---------- the car, for the legacy readers ----------
  // the car as the provider reads it, null when the house has none; the stack and the Home tile read it until #269 (Home)
  carInputs() {
    return this.car ? readCar(this.hass.states, this.store.config, this.store.names, this.car) : null;
  }
  // the sections this house has nothing for (true = nothing), for the Home tiles gateLacking hides: Climate with no thermostat and no heat pump, and the
  // water heater with neither of its sensors (the Climate tab is its descriptor's `available`, #248, Car's is its own, #251, and Energy's own cards
  // and tiles are the pane's, #239). Deleted with Home's tiles (#268)
  lacking() {
    return {
      climate: !this.ROOMS.length && !this.st(this.E.hp),
      water: !(this.st(this.E.whT) || this.st(this.E.whP)),
    };
  }

  // ---------- history ----------
  // The panel's shared history, read at start, when the config changes and every fifteen minutes; the cache answers a repeat within them (ADR 0028). Each pane loads
  // its own windows (ADR 0024); this one is what the readers below the features still use. It leaves with its last reader: #256, #266, #268 and #269.
  async refreshShared() {
    // a load under another config (the panel was redrawn meanwhile) is let go: the cache rejects its replies as StaleReply
    const generation = this.store.generation;
    if (!this.hass) return;
    try {
      const shared = await this.loadSharedHistory(Date.now());
      const first = !this.shared;
      this.shared = shared;
      if (first) this.ctx.shell.requestFrame(); // the settings popup's version line says the history is kept fresh
    } catch (e) {
      // a load of an old config is let go whatever went wrong: a network error is no StaleReply, but the new load owns the state
      if (e instanceof StaleReply || generation !== this.store.generation) return;
      console.error('home-panel history', e);
      return;
    }
    this.cache = {};
    this.renderLive();
  }
  // What the readers left in this panel still read: the stack's Energy-today card (the hourly flow and the meter's today), the Home water tile (the water
  // heater's day) and the header's "Live · history" line (`at`); the live pill reads its own through the cache since #256. The power windows are asked through
  // the panel-wide cache, the very calls Energy's card makes, so each is read once for the panel (ADR 0028), and cut by the providers' slices; the energy-only
  // windows are the card's, asked when it first connects. It is deleted with its last reader: #266 (the stack), #268 (the Home tile) and #269 (the header).
  async loadSharedHistory(now) {
    const {config} = this.store,
      ask = ({ids, period, start, types}) => this.ctx.statistics.statistics(ids, period, start, types);
    const w = powerWindows(now, config, this.fmtEn);
    const [hour7, today, meter33, fiveMin25h] = await Promise.all([
      ask(w.hour7),
      ask(w.today),
      ask(w.meter33),
      ask(w.fiveMin25h),
    ]);
    return {
      at: new Date(),
      flow: hourlyFlow(hour7, flowIds(config)),
      totals: meterTotals(
        meter33,
        today,
        {energy: config.entities.energy},
        dayKeys(now, this.fmtEn),
        this.fmtEn.isoDay,
      ),
      wh24: waterDay(fiveMin25h, {temperature: config.entities.whT, power: config.entities.whP}),
    };
  }

  // ---------- sheets ----------
  // the sheet host calls these two: a legacy sheet is on screen (over the page, or inline in its pane) or left it
  sheetOpened(id) {
    this.buildSheet(id);
  }
  sheetClosed() {}
  buildSheet(id) {
    if (!this.sheets.isOpen(id)) return;
    try {
      if (id === 'sh-light') this.renderLightSheet();
    } catch (e) {
      console.error('home-panel sheet', e);
    }
  }
  // ---------- weather ----------
  // The Weather pane's ForecastController owns the forecast subscription (spec 15) and the shell tells the guest of each message:
  // Home's card (`wxDays`) still reads `this.fc`. Deleted with its last reader (the Home move).
  forecastChanged(type, forecast) {
    this.fc[type] = forecast;
  }
  // ---------- the live pill's counts ----------
  // The live pill (#256) runs the activities and the Status checks, and the shell tells the guest whether an activity shows and how many
  // checks need attention: the weather chip slims beside an activity, redrawn as the legacy header redrew it, and the Home pane's sub-line
  // says the count. Deleted with its last readers, `renderHeader` and `renderPaneSubs` (the Home move, #269).
  liveChanged(running, attention) {
    this.liveRunning = running;
    this.attentionCount = attention;
    if (!this.hass || !this.$app) return; // drawn with both at the first render
    // the chips are drawn again even when unchanged: the pill beside them has just changed and moved them, and Chromium keeps a moved
    // glass chip's old sub-pixel raster, where the legacy header drew the chip and the pill together
    delete this.cache['wxchip-host'];
    for (const f of ['renderHeader', 'renderPaneSubs'])
      try {
        this[f]();
      } catch (e) {
        console.error('home-panel ' + f, e);
      }
  }
  // Temporary until Home's card and the idle clock move: `wxDays`, `dayName`, `alerts`, `sunDay`
  wxDays() {
    // EC sends day and night entries; fold them into one row per local day
    const by = new Map();
    (this.fc.daily || []).forEach(f => {
      const k = this.fmtEn.isoDay(ms(f.datetime)),
        r = by.get(k) || {k, t: ms(f.datetime), hi: null, lo: null, cond: null, pop: null, night: null};
      if (f.temperature != null && f.is_daytime !== false)
        r.hi = r.hi == null ? f.temperature : Math.max(r.hi, f.temperature);
      if (f.templow != null) r.lo = r.lo == null ? f.templow : Math.min(r.lo, f.templow);
      if (f.is_daytime === false && f.temperature != null && f.templow == null)
        r.lo = r.lo == null ? f.temperature : Math.min(r.lo, f.temperature);
      if (f.is_daytime === false) r.night = f.condition;
      else if (!r.cond) r.cond = f.condition;
      if (f.precipitation_probability != null) r.pop = Math.max(r.pop || 0, f.precipitation_probability);
      by.set(k, r);
    });
    return [...by.values()].map(r => ({...r, cond: r.cond || r.night})).slice(0, 7);
  }
  dayName(k, short) {
    if (k === this.fmtEn.isoDay(Date.now())) return 'Today';
    if (!short && k === this.fmtEn.isoDay(Date.now() + 864e5)) return 'Tomorrow';
    const at = dayAt(k),
      style = short ? 'short' : 'long';
    if (!this.store.isFrench) return this.fmtUtcEn.weekday(at, style);
    const d = this.fmtUtc.weekday(at, style);
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  sunDay(offset = 0) {
    const lat = (this.hass.config && this.hass.config.latitude) ?? 0,
      lon = (this.hass.config && this.hass.config.longitude) ?? 0;
    const t = Date.now() + offset * 864e5;
    return sunTimes(lat, lon, this.fmtEn.isoDay(t));
  }
  alerts() {
    const out = [];
    [
      [this.E.warnings, 'Warning', 'crit'],
      [this.E.watches, 'Watch', 'warn'],
      [this.E.advisories, 'Advisory', 'warn'],
      [this.E.statements, 'Statement', 'ok'],
    ].forEach(([id, kind, tone]) => {
      const s = this.st(id);
      if (!ok(s) || !(+s.state > 0)) return;
      const a = s.attributes;
      let i = 1,
        found = 0;
      while (a[`alert_${i}`] != null) {
        out.push({kind, tone, title: a[`alert_${i}`], time: a[`alert_time_${i}`]});
        i++;
        found++;
      }
      if (!found) out.push({kind, tone, title: `${plural(+s.state, kind.toLowerCase())} in effect`, time: null});
    });
    return out;
  }

  // ---------- who's home: the household's phones and watches (iPads and laptops stay home, so they don't count) ----------
  presence() {
    const reg = this.hass.entities || {},
      by = new Map();
    // a person entity wins: it follows the trackers chosen in HA's People settings
    for (const id of Object.keys(this.hass.states)) {
      if (!id.startsWith('person.')) continue;
      const who = this.HOUSEHOLD.find(h => fold(this.attr(id, 'friendly_name') || '').split(/\s+/)[0] === fold(h)),
        s = this.st(id);
      if (who && ok(s))
        by.set(who, {name: who, home: s.state === 'home', since: s.state === 'home' ? null : s.last_changed});
    }
    if (by.size) return this.HOUSEHOLD.filter(h => by.has(h)).map(h => by.get(h));
    for (const id of Object.keys(this.hass.states)) {
      if (!id.startsWith('device_tracker.') || (reg[id] || {}).hidden) continue;
      const n = this.attr(id, 'friendly_name') || '',
        m = n.match(/^(.+?)[’']s\s+(.+)$/) || n.match(/^(.+?)\s+(?:de|d[’'])\s*(.+)$/);
      if (!m) continue;
      const [owner, dev] = n.match(/^(.+?)[’']s\s/) ? [m[1], m[2]] : [m[2], m[1]];
      if (!/iphone|watch/i.test(dev)) continue;
      const who = this.HOUSEHOLD.find(h => fold(owner).split(/\s+/)[0] === fold(h));
      if (!who) continue;
      const s = this.st(id);
      if (!ok(s)) continue;
      const p = by.get(who) || {name: who, home: false, since: null};
      by.set(who, p);
      if (s.state === 'home') {
        p.home = true;
      } else if (!p.home) p.since = s.last_changed;
    }
    return this.HOUSEHOLD.filter(h => by.has(h)).map(h => by.get(h));
  }
  whoHtml() {
    const P = this.presence();
    if (!P.length) return '';
    return `<div class="who" aria-label="Who's home">${P.map(p => `<span class="wp${p.home ? ' home' : ''}"><i></i>${esc(p.name)}<small>${p.home ? 'home' : 'away'}</small></span>`).join('')}</div>`;
  }

  // ---------- TV ----------
  // kept for the now-playing stack card, through speakers(); #266 deletes it with the legacy stack
  tv() {
    const reg = this.hass.entities || {},
      dev = this.hass.devices || {};
    const ids = Object.keys(this.hass.states).filter(
      id => id.startsWith('media_player.') && this.attr(id, 'device_class') === 'tv' && !(reg[id] || {}).hidden,
    );
    const id = ids.find(i => (reg[i] || {}).platform === 'samsungtv') || ids[0];
    if (!id) return null;
    const e = reg[id] || {},
      D = dev[e.device_id] || {};
    const wol = Object.keys(this.hass.states).find(
      i => i.startsWith('button.wake_on_lan_') && /tv/i.test(this.attr(i, 'friendly_name') || ''),
    );
    return {
      id,
      wol,
      aid: e.area_id || D.area_id || '',
      name: D.name_by_user ? this.name(e.device_id) : e.platform === 'samsungtv' ? 'Samsung TV' : this.name(id, 'TV'),
    };
  }
  entArea(id) {
    const e = (this.hass.entities || {})[id] || {};
    return e.area_id || ((this.hass.devices || {})[e.device_id] || {}).area_id || '';
  }
  // an area's name as the panel shows it; an area that has no name of its own gives the fallback, as it always did
  areaName(aid, fallback = '') {
    const a = (this.hass.areas || {})[aid];
    return a && a.name ? this.name(aid) : fallback;
  }
  // a device's name as the panel shows it; a device that has no name of its own (not even its integration's) gives the
  // fallback, usually the name of the entity that led to it
  deviceName(devId, fallback) {
    const D = (this.hass.devices || {})[devId];
    return D && (D.name_by_user || D.name) ? this.name(devId) : fallback;
  }
  // speakers by area (HomePods and the like); camera speakers and the TV have their own controls
  // kept for the now-playing stack card (stackCards); #266 deletes it with the legacy stack
  speakers() {
    const reg = this.hass.entities || {},
      areas = this.hass.areas || {},
      tv = (this.tv() || {}).id;
    const words = x =>
      fold(x)
        .replace(/'s\b/g, '')
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    return Object.keys(this.hass.states)
      .filter(
        i =>
          i.startsWith('media_player.') &&
          i !== tv &&
          !(reg[i] || {}).hidden &&
          !['unifiprotect', 'samsungtv'].includes((reg[i] || {}).platform),
      )
      .map(i => {
        // the words of the area's name, as Home Assistant gives it and as the panel shows it, are the ones to drop
        const aid = this.entArea(i),
          aw = new Set([...words((areas[aid] || {}).name || ''), ...words(this.areaName(aid))]),
          fn = this.name(i);
        // "HomePod mini Kitchen" in the Kitchen is just "HomePod mini"
        const short = String(fn)
          .split(/\s+/)
          .filter(w => !aw.has(words(w)[0]))
          .join(' ');
        return {id: i, aid, name: short || fn};
      })
      .filter(x => x.aid);
  }
  setView() {
    // Tabs is the only view since 1.16.0, on the iPad and the iPhone alike; the view switcher is gone
    const prev = this.view;
    this.view = 'tabs';
    this.root.querySelector('.cols').hidden = true;
    this.$('tabview').hidden = false;
    if (prev !== 'tabs') this.enterTabs();
  }
  // ---------- Phone: the Tabs view under 600 px. Bottom tab bar, one column, summary tiles that open the detail sheets ----------
  // the shell's `compact` changed and its frame already follows
  compactChanged() {
    if (!this.$app) return; // nothing drawn yet: the first draw reads the shell
    // the sheet host has closed the open sheet and moved the five detail panels; the cards move here
    if (this.view === 'tabs') {
      this.leaveTabs();
      this.enterTabs();
    }
    this.cache = {};
    this.renderLive();
  }
  renderCompact() {
    if (!this.compact || this.view !== 'tabs') return;
    for (const f of ['renderLightTiles']) {
      try {
        this[f]();
      } catch (e) {
        console.error('home-panel phone', f, e);
      }
    }
  }
  // Lights on the phone: the same tiles as the tablet, two to a row; a tile opens the room's controls in a sheet
  renderLightTiles() {
    if (this.tab !== 'lights' || this.lightDrag) return;
    const A = this.lightAreas();
    if (!A.length) {
      this.set('ltiles', '<p class="hint">No lights found.</p>');
      return;
    }
    this.set('ltiles', this.lightGrid(A));
  }
  openLight(aid) {
    this.lightSel = aid;
    this.lightPick = false;
    this.sheets.open('sh-light');
  }
  // the room's sheet: power in the header, brightness and colour as two tall sliders, Auto and Night as switches in a list,
  // single bulbs as chips, and "Linked with" as a row that opens a list of the other rooms (the iOS way to pick one value)
  renderLightSheet() {
    if (!this.sheets.isOpen('sh-light') || this.lightDrag) return;
    const A = this.lightAreas(),
      a = A.find(x => x.aid === this.lightSel);
    if (!a) {
      this.sheets.close();
      return;
    }
    const s = this.lightState(a),
      m = this.lightMode(a),
      aid = esc(a.aid);
    this.set('lshh', esc(a.name));
    this.set('lshsub', this.lightSub(a, s, m));
    const pw = this.$('lshpwr');
    pw.dataset.a = a.aid;
    pw.setAttribute('aria-checked', s.any);
    pw.setAttribute('aria-label', `${a.name} lights`);
    pw.disabled = !s.avail;
    pw.style.setProperty('--lc', s.tint || 'var(--warn)');
    this.$('sh-light')
      .querySelector('.panel')
      .style.setProperty('--lc', s.tint || 'var(--warn)');
    if (this.lightPick) {
      this.set('lsheet', this.lightPicker(a, A));
      return;
    }
    const br = s.any ? s.br : 0;
    const brP = `<div class="lpc"><div class="lpill lbr${s.any ? '' : ' off'}" data-lp="br" data-a="${aid}" role="slider" tabindex="0" aria-label="Brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${br}" aria-valuetext="${s.any ? br + '%' : 'Off'}"${s.avail ? '' : ' aria-disabled="true"'} style="--v:${br}%"><span class="lpf"></span><span class="lpmx">${ico('lsun', 20)}</span><span class="lpmn">${ico('bulb', 28)}</span></div>
      <div class="lpv"><b class="num">${s.any ? br + '%' : 'Off'}</b><small>Brightness</small></div></div>`;
    const ct = s.ct,
      night = m.nightOn && m.alOn;
    const ctP = !ct
      ? ''
      : `<div class="lpc"><div class="lpill lct${night ? ' night' : ''}" data-lp="ct" data-a="${aid}" data-min="${ct.min}" data-max="${ct.max}" role="slider" tabindex="0" aria-label="Colour temperature" aria-valuemin="${ct.min}" aria-valuemax="${ct.max}" aria-valuenow="${ct.k}" aria-valuetext="${night ? 'Night' : ct.k + ' K'}"${s.any && s.avail ? '' : ' aria-disabled="true"'} style="--v:${(((ct.k - ct.min) / (ct.max - ct.min)) * 100).toFixed(1)}%;--warm:${kelvinRGB(ct.min)};--mid:${kelvinRGB((ct.min + ct.max) / 2)};--cool:${kelvinRGB(ct.max)}"><span class="lphd"></span><span class="lpmx">${ico('lsnow', 18)}</span><span class="lpmn">${ico('lflame', 18)}</span><span class="lpnl">Night</span></div>
      <div class="lpv"><b class="num">${night ? 'Night' : ct.k + ' K'}</b><small>${night ? 'Red, very dim' : ct.k <= 3000 ? 'Warm white' : ct.k >= 5000 ? 'Cool white' : 'Neutral white'}</small></div></div>`;
    const sw = (l, on, id, ok2, label) =>
      `<button type="button" class="sw" role="switch" aria-checked="${!!on}" aria-label="${label}" data-l="${l}" data-a="${aid}" data-id="${esc(id)}" ${ok2 ? '' : 'disabled'}></button>`;
    const modes = !a.al
      ? ''
      : `<div class="lgrp">
      <div class="lgr"><span class="lgi" style="--gi:#D98A1E">${ico('lsun', 20)}</span><span class="tx"><b>Auto</b><small>Brightness and colour follow the time of day</small></span>${sw('al', m.auto, a.al, ok(this.st(a.al)), 'Auto')}</div>
      ${m.night ? `<div class="lgr"><span class="lgi" style="--gi:#C2412A">${ico('moon', 19)}</span><span class="tx"><b>Night</b><small>Very dim red light for the night</small></span>${sw('night', night, m.night, ok(this.st(m.night)), 'Night')}</div>` : ''}
    </div>`;
    const isOn = i => (this.st(i) || {}).state === 'on';
    const chips =
      a.units.length > 1
        ? `<div class="lchips" role="group" aria-label="Bulbs"><span class="lcl">Bulbs</span>${a.units.map((i, k) => `<button type="button" class="lchip" aria-pressed="${isOn(i)}" data-l="one" data-id="${esc(i)}" ${ok(this.st(i)) ? '' : 'disabled'}><span class="ck" aria-hidden="true">${ico('check', 14)}</span>${esc(a.labels[k])}</button>`).join('')}</div>`
        : '';
    const L = a.link,
      admin = !!(this.hass.user && this.hass.user.is_admin);
    const link =
      A.length < 2
        ? ''
        : `<div class="lgrp"><button type="button" class="lgr lnav" data-l="pick" data-a="${aid}" ${admin ? '' : 'disabled'}><span class="lgi" style="--gi:#5B7FB8">${ico('link', 19)}</span><span class="tx"><b>Linked with</b><small>${admin ? 'Moves together with another room' : 'Only an admin can change this'}</small></span><span class="lval">${L ? esc(L.other.name) : 'None'}</span>${ico('chev', 18)}</button></div>`;
    this.set('lsheet', `<div class="lpills">${brP}${ctP}</div>${modes}${chips}${link}`);
  }
  // "Linked with": None plus every other room, a check mark on the current one; a room already linked elsewhere says so
  lightPicker(a, A) {
    const cur = a.link ? a.link.other.aid : '',
      aid = esc(a.aid);
    const opt = (id, name, sub) =>
      `<button type="button" class="lgr lopt" role="radio" aria-checked="${cur === id}" data-l="linkto" data-a="${aid}" data-al="${esc(id)}"><span class="tx"><b>${esc(name)}</b><small>${sub}</small></span><span class="lck" aria-hidden="true">${cur === id ? ico('check', 20) : ''}</span></button>`;
    const rows = [
      opt('', 'None', 'This room moves on its own'),
      ...A.filter(x => x.aid !== a.aid).map(x => {
        const s = this.lightState(x),
          m = this.lightMode(x);
        return opt(
          x.aid,
          x.name,
          this.lightSub(x, s, m) +
            (x.link && x.link.other.aid !== a.aid
              ? ` · <span class="lnow">now with ${esc(x.link.other.name)}</span>`
              : ''),
        );
      }),
    ];
    return `<div class="lpkh"><button type="button" class="lback" data-l="back" data-a="${aid}">${ico('chevl', 20)}<span>${esc(a.name)}</span></button><b>Link with</b></div>
      <div class="lgrp" role="radiogroup" aria-label="Link with">${rows.join('')}</div>
      <p class="lfoot">Linked rooms switch, dim and change colour together. Picking a room copies this room's light onto it. A room links with one other room at a time.</p>`;
  }
  // the word under each section in the phone's More sheet, in English, for the registry's summary
  moreLines() {
    const L = this.powerNow();
    // Media's line is the feature's own (mediaBrief, #217), and so is Air's (airBrief, #234)
    const X = this.doorSensors(),
      open = X.filter(x => x.kind === 'door' && x.on).length,
      moving = X.some(x => x.kind === 'motion' && x.on);
    const A = this.auAutos ? this.auAutos() : [],
      running = A.filter(a => a.current).length;
    const sb = {
      energy: L.grid == null ? '' : `${L.grid < 1 ? Math.round(L.grid * 1000) + ' W' : L.grid.toFixed(2) + ' kW'} now`,
      cams: [open ? plural(open, 'door') + ' open' : 'Doors closed', moving ? 'motion now' : '']
        .filter(Boolean)
        .join(' · '),
      auto: running ? `${running} running` : A.length ? plural(A.length, 'automation') : '',
    };
    return sb;
  }
  // The sheet is an element of the shell, in a shadow root the French layer's observer does not see, so the word comes
  // over in the panel's language; `text` is the layer's own rewrite of a text node, and leaves English alone. The shell asks
  // for the six sections one after the other in one task, so one pass over the house serves them all.
  // (moreMemo goes with moreLine, deleted with the guest)
  moreLine(key) {
    if (!this.moreMemo) {
      this.moreMemo = this.moreLines();
      queueMicrotask(() => (this.moreMemo = null));
    }
    const line = this.moreMemo[key];
    return line ? this.french.text(line) : null;
  }
  // ---------- Tabs view: a left rail, one pane per subject; cards and detail panels move into the panes ----------
  enterTabs() {
    const mv = (id, host, first) => {
      const el = this.$(id),
        h = this.$(host);
      if (el && h) first ? h.prepend(el) : h.appendChild(el);
    };
    mv('lights', 'lhost');
    this.tabChanged(this.tab);
  }
  leaveTabs() {
    this.plan = null; // the cards go back into the columns on the next layout
  }
  // the shell shows the pane of `t` (it remembered the tab and drew the rail and the panes); this is the guest's part
  tabChanged(t) {
    if (!this.$app || this.view !== 'tabs') return; // nothing drawn yet: enterTabs asks again once it is
    const prev = this.drawnTab;
    this.drawnTab = t;
    if (t === 'lights' && prev !== t) this.loadLightOrder(); // another screen may have rearranged them
    if (t !== 'lights' && this.lightEdit) this.setLightEdit(false);
    this.sheets.paneShown(t); // the host shows this pane's legacy detail panel inline, on a tablet: none has one since #252, and #188 deletes this call
    this.renderTabs();
    // on a phone each section starts at the top, as an app's tabs do
    if (this.compact && prev && prev !== t) {
      try {
        this.$app.scrollIntoView({block: 'start'});
      } catch {}
    }
  }
  renderTabs() {
    if (this.view !== 'tabs' || !this.hass) return;
    for (const f of ['renderHome', 'renderAlBar', 'renderPaneSubs', 'renderAuto', 'renderCompact', 'gateLacking']) {
      try {
        this[f]();
      } catch (e) {
        console.error('home-panel tabs', f, e);
      }
    }
  }
  // what the house lacks is hidden wherever it shows. The rail's Climate and Car buttons are the shell's: it asks the Climate descriptor's `available`
  // and availability() (Car) and draws the rail from the answers. The Home tiles that open them, and the phone's Water heater tile, are the guest's, and it
  // hides them here. It runs last in renderTabs because the renderers above redraw their tiles whole: a hide that ran before
  // a redraw let the new tile show until the next update hid it again
  gateLacking() {
    const L = this.lacking(),
      hide = (sel, off) =>
        this.root.querySelectorAll(sel).forEach(el => {
          el.hidden = off;
        });
    hide('[data-pane="climate"]', L.climate);
    hide('[data-pane="car"]', !this.car);
    hide('[data-opens="energy.water"]', L.water);
    // Climate's and Car's tabs answer from their descriptors, not from availability(), but a change of either must still ask the shell for a frame: this key carries them (deleted with Home's tiles, #268)
    const key = JSON.stringify([!this.car, L.climate]);
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.ctx.shell.requestFrame();
    }
  }
  // which tabs this house lacks (false: nothing for it), for the shell's registry: none of the tabs the guest still draws has an opinion, Climate's and Car's are their descriptors' `available`
  availability() {
    return {};
  }
  // whether the history behind the charts has loaded, which the settings popup's version line says
  statisticsLoaded() {
    return Boolean(this.shared);
  }
  // one line under each pane title, like the detail sheets have
  renderPaneSubs() {
    const isOn = i => (this.st(i) || {}).state === 'on',
      L = this.powerNow(),
      att = this.attentionCount;
    const lit = this.lightAreas()
        .flatMap(a => a.ids)
        .filter(isOn).length,
      als = [
        ...new Set(
          this.lightAreas()
            .map(a => a.al)
            .filter(Boolean),
        ),
      ],
      alOn = als.filter(isOn).length;
    const temps = L.rooms.map(r => r.temperature).filter(v => v != null),
      avg = temps.length ? sum(temps) / temps.length : null,
      out = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT);
    if (this.tab === 'home')
      this.set(
        'hsub',
        [
          this.fmtEn.dateLong(new Date()),
          avg == null ? '' : `${avg.toFixed(1)}° inside`,
          out == null ? '' : `${f1(out)}° outside`,
          att ? plural(att, 'item') + (att === 1 ? ' needs' : ' need') + ' attention' : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
    if (this.tab === 'lights') {
      this.set(
        'lsub',
        this.lightEdit
          ? 'Drag the lights into the order you want'
          : [
              lit ? `${plural(lit, 'light')} on` : 'All lights off',
              als.length
                ? `Adaptive Lighting ${alOn === als.length ? 'on everywhere' : alOn ? `on in ${alOn} of ${als.length}` : 'off everywhere'}`
                : '',
            ]
              .filter(Boolean)
              .join(' · '),
      );
      // only admins can write the house-wide order, so only they get the Arrange button
      const bar = this.$('ledbar');
      if (bar)
        bar.hidden =
          !(this.hass.user && this.hass.user.is_admin) ||
          this.lightAreas().filter(x => !x.link || x.link.first).length < 2;
      const rs = this.$('lreset');
      if (rs) rs.hidden = !this.lightEdit || !(this.lightOrder && this.lightOrder.length);
    }
  }
  // The configuration card (spec 13): one line per setting the panel could not use, for an admin, while the store holds
  // problems; nothing at all otherwise (the host stays hidden and empty, so a clean config draws exactly what it always drew).
  // The text is the catalog's, in the user's language, escaped like every legacy string. translate="no": it is already in
  // that language, and the French layer (which reads English) must not look it up a second time, neither its text nor any
  // aria-label or title the aside may one day carry (the layer skips both under that attribute).
  renderConfigCard() {
    const host = this.$('cfgerr');
    if (!host) return;
    const problems = this.store.isAdmin ? this.store.configProblems : [];
    const t = this.store.t;
    // every message opens with its path (`rooms[1].icon: ...`): the path is set in <code>, the rest is the message
    const line = p => {
      const msg = t(p.key, p.values);
      return `<li>${msg.startsWith(p.path) ? `<code>${esc(p.path)}</code>${esc(msg.slice(p.path.length))}` : esc(msg)}</li>`;
    };
    this.set(
      'cfgerr',
      problems.length
        ? `<aside class="card cfgerr" aria-labelledby="cfgerr-h" translate="no"><h3 id="cfgerr-h">${esc(t('config.title'))}</h3><p>${esc(t('config.intro', {n: problems.length}))}</p><ul>${problems.map(line).join('')}</ul><p class="s">${esc(t('config.footer'))}</p></aside>`
        : '',
    );
    host.hidden = !problems.length;
  }
  // Home pane, as sketched: weather and the house on the left, six big tiles, then doors and what's coming up
  renderHome() {
    if (this.tab !== 'home') return;
    this.renderConfigCard();
    const L = this.powerNow(),
      isOn = i => (this.st(i) || {}).state === 'on',
      SH = this.shared;
    const sun = this.st(this.E.sun),
      dayUp = sun && sun.state === 'above_horizon',
      nxt = this.st(dayUp ? this.E.setting : this.E.rising),
      nxt2 = this.st(dayUp ? this.E.rising : this.E.setting);
    const temp = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT),
      cond = this.st(this.E.cond),
      hi = this.num(this.E.hi),
      lo = this.num(this.E.lo);
    const hwxWas = this.cache.hwx;
    this.set(
      'hwx',
      `<div class="muted" style="font-size:13px;font-weight:500">${dayUp ? 'Sunset' : 'Sunrise'} <b style="color:var(--fg)">${ok(nxt) ? this.fmtEn.time(new Date(nxt.state)) : '–'}</b>${ok(nxt2) ? ` · ${dayUp ? 'sunrise' : 'sunset'} <b style="color:var(--fg)">${this.fmtEn.time(new Date(nxt2.state))}</b>` : ''}</div>
      <div class="hbig"><span class="num">${temp == null ? '–' : Math.round(temp) + '°'}</span><div><div class="hc">${esc(condName(ok(cond) ? cond.state : (this.st(this.E.weather) || {}).state))}</div><div class="muted">${hi != null ? `High ${Math.round(hi)}°` : ''}${lo != null ? ` · low ${Math.round(lo)}°` : ''}</div></div></div>
      <div class="hhouse">${houseImg(this.CFG.house)}</div>
      <div class="lbl hwho">Who's home</div>${this.whoHtml() || '<p class="hint">No one is tracked yet.</p>'}${this.compact ? '' : '<div class="hstk" id="hstk" hidden></div>'}`,
    );
    // 2.9.0: under Who's home, the rest of the card holds the idle clock's smart stack (a fresh card slot whenever the card was rebuilt)
    if (this.cache.hwx !== hwxWas) this.cache.hstk = null;
    this.renderHomeStack();
    const A = this.lightAreas(),
      onAreas = A.map(a => ({a, on: a.ids.filter(isOn)})).filter(x => x.on.length);
    const temps = L.rooms.map(r => r.temperature).filter(v => v != null),
      avg = temps.length ? sum(temps) / temps.length : null,
      nHeat = L.rooms.filter(r => r.heating).length;
    const hp = this.st(this.E.hp),
      hpTxt = !ok(hp) ? 'offline' : hp.state === 'off' ? 'off' : hp.attributes.hvac_action || hp.state;
    const c = this.carInputs(),
      // the tier as the tile said it: "low rate", "medium rate", "challenge rate", "current rate", "rate unknown"; the legacy English,
      // which leaves with the Home tiles (#268), when the model's tier wording takes over
      rateShort = {
        low: 'low rate',
        medium: 'medium rate',
        challenge: 'challenge rate',
        current: 'current rate',
        unknown: 'rate unknown',
      }[this.hiloRates().tier];
    // the Air tile: the worst room's level, and what is high in the rooms at that level
    const airs = this.airRooms(),
      airWorst = Math.max(-1, ...airs.map(x => x.rating.level)),
      airWhy = airs
        .filter(x => x.rating.level === airWorst && airWorst > 0)
        .map(
          ({room, rating}) =>
            `${room.name}: ${rating.why.length ? rating.why.map(w => `${AIR_WORDS[w.k][0]} ${this.airFigure(w.k, w.v)}`).join(', ') : `Mila index ${Math.round(rating.milaIndex)}`}`,
        )
        .join(' · ');
    const whT = this.num(this.E.whT),
      whP = this.kw(this.E.whP),
      wh24 = SH ? sum(SH.wh24.p.filter(x => x[0] >= Date.now() - 864e5).map(x => x[1])) / 12 : null;
    const kwTxt = v => (v == null ? '–' : v < 1 ? Math.round(v * 1000) + ' W' : v.toFixed(2) + ' kW');
    const tiles = [
      [
        'lights',
        'bulb',
        'var(--warn)',
        'Lights',
        onAreas.length
          ? plural(
              onAreas.reduce((n, x) => n + x.on.length, 0),
              'light',
            ).replace(/^(\d+) lights?$/, '$1 on')
          : 'All off',
        onAreas.length
          ? esc(
              onAreas
                .map(
                  x =>
                    `${x.a.name} ${Math.round(sum(x.on.map(i => this.attr(i, 'brightness') || 0)) / x.on.length / 2.55)}%`,
                )
                .join(' · '),
            )
          : 'Nothing on',
      ],
      [
        'climate',
        'therm',
        'var(--c-heat)',
        'Climate',
        avg == null ? '–' : avg.toFixed(1) + '°',
        `Inside · ${plural(nHeat, 'room')} heating${this.E.hp ? ` · heat pump ${esc(hpTxt)}` : ''}`,
      ],
      [
        'car',
        'car',
        'var(--c-ev)',
        'Car',
        c ? f1(c.soc) + '%' : '–',
        c
          ? [
              c.range != null ? Math.round(c.range) + ' km' : '',
              c.charging ? 'charging' : c.plugged ? 'plugged in' : 'unplugged',
              c.locked == null ? '' : c.locked ? 'locked' : 'unlocked',
            ]
              .filter(Boolean)
              .join(' · ')
          : 'No car found',
      ],
      [
        'energy',
        'bolt',
        'var(--c-grid)',
        'Energy',
        kwTxt(L.grid),
        `Now${SH ? ` · ${f1(SH.totals.today)} kWh today` : ''} · ${esc(rateShort)}`,
      ],
      [
        'air',
        'aq',
        'var(--ok)',
        'Air',
        !airs.length ? '–' : airWorst < 0 ? 'No data' : AIR_LEVELS[airWorst],
        !airs.length
          ? 'No purifiers'
          : `${plural(airs.length, 'purifier')}${airWorst > 0 ? ' · ' + esc(airWhy) : ' · clean air everywhere'}`,
      ],
      [
        'energy',
        'drop',
        'var(--c-wh)',
        'Water heater',
        whT == null ? '–' : f1(whT) + '°',
        `${whP > 0.02 ? 'Heating' : 'Idle'}${wh24 != null ? ` · ${wh24.toFixed(1)} kWh today` : ''}`,
      ],
    ];
    // on a phone a tile opens its sheet straight away; Lights goes to its section, the water heater opens its card (Energy's sheet)
    const PH = {
      climate: 'data-opens="climate.detail"',
      car: 'data-opens="car.detail"',
      energy: 'data-opens="energy.detail"',
      air: 'data-opens="air.detail"',
    };
    const extra = (k, i) => (!this.compact ? '' : i === 'drop' ? 'data-opens="energy.water"' : PH[k] || '');
    const hwx = this.$('hwx');
    hwx.classList.toggle('tap', this.compact);
    if (this.compact) {
      hwx.dataset.opens = 'weather.detail';
      hwx.setAttribute('role', 'button');
      hwx.tabIndex = 0;
    } else {
      delete hwx.dataset.opens;
      hwx.removeAttribute('role');
      hwx.removeAttribute('tabindex');
    }
    this.set(
      'htiles',
      tiles
        .map(
          ([k, i, col, lbl, v, sb]) =>
            `<button type="button" class="htile${k === 'car' && c && c.charging ? ' chg' : ''}" data-pane="${k}" ${extra(k, i)}><span class="hh"><span style="color:${col}">${ico(i, 22)}</span><span class="lbl">${lbl}</span><span class="go">›</span></span><span class="hv num">${v}</span><span class="hs">${sb}</span></button>`,
        )
        .join(''),
    );
  }
  // what the house has planned: the sun (the theme and the sunrise lights-off follow it), Hilo, Hydro-Québec, the car, routines
  upcoming() {
    const out = [],
      day = this.up(),
      set = this.st(this.E.setting),
      rise = this.st(this.E.rising);
    const sunset = () => ok(set) && out.push([this.fmtEn.time(new Date(set.state)), 'Sunset · theme turns dark']),
      sunrise = () =>
        ok(rise) && out.push([this.fmtEn.time(new Date(rise.state)), 'Sunrise · every light off, night modes off']);
    if (day) {
      sunset();
      sunrise();
    } else {
      sunrise();
      sunset();
    }
    const defi = this.hiloChallenge();
    if (defi && defi.active) out.push(['Hilo', `Challenge: ${esc(defi.state)}`]);
    if (this.hydroQuebec()?.peakUpcoming) out.push(['Hydro-Québec', 'Critical peak coming']);
    // the departure schedule only counts while its switch is on
    if (this.car && (this.st(this.car.id('switch', 'departuretimes')) || {}).state === 'on') {
      const t = this.schedText();
      if (!/^No /.test(t)) out.push(['Car', esc(t.replace(/ saved\.$/, ' departure'))]);
    }
    this.MODES.forEach(id => {
      const m = this.st(id);
      if (m && m.state === 'on') out.push(['On', esc(this.name(id))]);
    });
    return out;
  }
  // Lights pane: a thin strip of today's Adaptive Lighting colour temperature, sunrise to sunset, with where we are now
  renderAlBar() {
    const el = this.$('albar');
    if (!el || this.tab !== 'lights') return;
    const als = [
      ...new Set(
        this.lightAreas()
          .map(a => a.al)
          .filter(Boolean),
      ),
    ];
    el.hidden = !als.length;
    if (!als.length) return;
    const S = this.sunDay(0),
      now = Date.now(),
      h0 = now - this.fmtEn.hourNow(Date.now()) * 36e5;
    const cfg = als.map(a => this.attr(a, 'configuration') || {}),
      minK = Math.min(...cfg.map(c => +c.min_color_temp || 2000)),
      maxK = Math.max(...cfg.map(c => +c.max_color_temp || 5500));
    // Adaptive Lighting's curve: the maximum at solar noon, falling as a parabola to the minimum at sunrise and sunset, the minimum at night
    const ct = t => {
      if (!S.rise || t < S.rise || t > S.set) return minK;
      const k = t < S.noon ? (t - S.noon) / (S.noon - S.rise) : (t - S.noon) / (S.set - S.noon);
      return minK + (maxK - minK) * Math.max(0, 1 - k * k);
    };
    const stops = [];
    for (let i = 0; i <= 48; i++) {
      const t = h0 + i * 18e5,
        col = kelvinRGB(ct(t)),
        night = !S.rise || t < S.rise || t > S.set;
      stops.push(`${night ? `color-mix(in srgb,${col} 35%,var(--card2))` : col} ${((i / 48) * 100).toFixed(1)}%`);
    }
    const x = t => `${Math.max(0, Math.min(100, ((t - h0) / 864e5) * 100)).toFixed(2)}%`;
    const on = als.filter(a => (this.st(a) || {}).state === 'on'),
      live = on.map(a => this.attr(a, 'color_temp_kelvin')).find(v => v != null),
      nowK = Math.round(live != null ? live : ct(now));
    const marks = [
      [S.rise, 'Sunrise'],
      [S.noon, 'Noon'],
      [S.set, 'Sunset'],
    ].filter(m => m[0]);
    this.set(
      'albar',
      `<div class="top"><span class="lbl">Adaptive Lighting today</span><span class="right">${on.length ? `Now <b class="num" style="color:var(--fg)">${nowK} K</b> · ${on.length === als.length ? 'on everywhere' : `on in ${on.length} of ${als.length}`}` : 'Off everywhere'}</span></div>
      <div class="alstrip"><div class="algrad" style="background:linear-gradient(90deg,${stops.join(',')})"></div><i class="alnow" style="left:${x(now)}"></i>
        ${marks.map(([t, l]) => `<span class="almark" style="left:${x(t)}"><i></i>${this.compact ? '' : l + ' '}${this.fmtEn.time(new Date(t))}</span>`).join('')}
        ${[0, 6, 12, 18].map(h => `<span class="alh" style="left:${(h / 24) * 100}%">${this.fmtEn.hour(h0 + h * 36e5)}</span>`).join('')}</div>`,
    );
  }
  lightAreas() {
    const reg = this.hass.entities || {},
      dev = this.hass.devices || {},
      by = new Map();
    const area = id => {
      const e = reg[id] || {};
      return e.area_id || (dev[e.device_id] || {}).area_id || '';
    };
    const all = Object.keys(this.hass.states).filter(id => id.startsWith('light.'));
    // light groups carry their members in entity_id: the group gives the area, its bulbs get the controls
    const groups = all.filter(id => Array.isArray(this.attr(id, 'entity_id'))),
      owner = {};
    groups.forEach(g =>
      this.attr(g, 'entity_id').forEach(m => {
        if (!owner[m]) owner[m] = g;
      }),
    );
    const gArea = g => area(g) || this.attr(g, 'entity_id').map(area).find(Boolean) || '';
    const slot = aid => {
      if (!by.has(aid)) by.set(aid, {ids: [], units: []});
      return by.get(aid);
    };
    // the buttons under each area are its light groups plus any light that isn't in a group
    groups.forEach(g => slot(gArea(g)).units.push(g));
    for (const id of all) {
      const e = reg[id] || {};
      if (groups.includes(id) || e.entity_category || (e.hidden && !owner[id])) continue;
      const a = slot(owner[id] ? gArea(owner[id]) || area(id) : area(id));
      a.ids.push(id);
      if (!owner[id]) a.units.push(id);
    }
    // Adaptive Lighting: by its configured lights when exposed, else its device's area, else a group sharing its name
    const als = Object.keys(this.hass.states).filter(
      id => /^switch\.adaptive_lighting_/.test(id) && !/_(sleep_mode|adapt_color|adapt_brightness)$/.test(id),
    );
    const alName = a => fold(String(this.attr(a, 'friendly_name') || '').replace(/^Adaptive Lighting:\s*/i, ''));
    // AL hides its light list unless include_config_in_attributes is on, so areas whose group doesn't carry the
    // instance's name are listed in AL_AREAS (the staircase group, Lumieres Passage, is under the Bureau instance)
    const alLights = a => this.attr(a, 'configured_lights') || (this.attr(a, 'configuration') || {}).lights || [];
    const alFor = (aid, ids) =>
      als.find(a =>
        alLights(a)
          .flatMap(l => [l, ...(this.attr(l, 'entity_id') || [])])
          .some(l => ids.includes(l)),
      ) ||
      (this.AL_AREAS[aid] && als.find(a => a === this.AL_AREAS[aid])) ||
      als.find(a => aid && area(a) === aid) ||
      als.find(
        a =>
          alName(a) &&
          groups.some(g => area(g) === aid && fold(String(this.attr(g, 'friendly_name') || '')).includes(alName(a))),
      );
    const byName = (x, y) => this.name(x).localeCompare(this.name(y));
    /** @type {any[]} */
    const out = [];
    for (const [aid, {ids, units}] of by) {
      if (!ids.length) continue;
      units.sort(byName);
      const area = aid ? this.name(aid) : 'Other lights',
        labels = shortNames(units.map(i => this.name(i)));
      // areas listed in split_light_areas get one tile per light group (or loose light) instead of one for the whole area;
      // each tile keeps the area's Adaptive Lighting switch, so Auto and Night still act on the area
      if (this.SPLIT_AREAS.includes(aid) && units.length > 1) {
        const al = alFor(aid, ids);
        units.forEach((u, k) => {
          const mine = ids.filter(i => (owner[i] || i) === u);
          if (mine.length)
            out.push({aid: u, area, other: !aid, name: labels[k], ids: mine, al, units: [u], labels: [labels[k]]});
        });
      } else out.push({aid, area, other: !aid, name: area, ids, al: alFor(aid, ids), units, labels});
    }
    // split tiles stay together under their area's place in the list
    out.sort((a, b) => a.other - b.other || a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
    // linked rooms: the second card of a pair moves next to the first and they act together
    const card = k => out.find(t => t.aid === k) || out.find(t => t.units.includes(k) || t.ids.includes(k));
    for (const keys of this.lightLinkList()) {
      const a = card(keys[0]),
        b = card(keys[1]);
      if (!a || !b || a === b || a.link || b.link) continue;
      out.splice(out.indexOf(b), 1);
      out.splice(out.indexOf(a) + 1, 0, b);
      a.link = {other: b, on: true, first: true};
      b.link = {other: a, on: true, first: false};
    }
    // the order someone arranged on the Lights tab (saved for the whole house); a pair moves as one, lights it doesn't know go last
    const O = this.lightOrder;
    if (Array.isArray(O) && O.length) {
      const units = [];
      for (const t of out) if (!t.link || t.link.first) units.push(t.link ? [t, t.link.other] : [t]);
      const at = u => {
        const i = O.indexOf(u[0].aid);
        return i < 0 ? Infinity : i;
      };
      return units
        .map(/** @returns {[any[], number]} */ (u, i) => [u, i])
        .sort((x, y) => at(x[0]) - at(y[0]) || x[1] - y[1])
        .flatMap(x => x[0]);
    }
    return out;
  }
  // the pairs of linked rooms: picked in a light sheet and saved for the whole house (system data light_links),
  // or, until someone picks, the panel config's light_links (a pair with a switch counts while its switch is on)
  lightLinkList() {
    const v = this.sysData && this.sysData.light_links;
    if (Array.isArray(v)) return v.filter(p => Array.isArray(p) && p.length === 2).map(p => p.map(String));
    return this.LIGHT_LINKS.filter(l => l.keys.length === 2 && (!l.sw || (this.st(l.sw) || {}).state === 'on')).map(
      l => l.keys,
    );
  }
  saveLightLinks(pairs, msg) {
    const v = {...(this.sysData || {}), light_links: pairs};
    this.sysData = v;
    this.tick();
    this.api
      .setSystemData(LIGHT_ORDER_KEY, v)
      .then(() => this.toast(msg))
      .catch(e => this.toast(`Couldn't save the link: ${e.message || e.code || e}`, true));
  }
  // the light order lives in Home Assistant's frontend system data (one value for every screen; only admins may write it)
  loadLightOrder() {
    if (!this.hass) return;
    this.api
      .getSystemData(LIGHT_ORDER_KEY, {stale: false}) // the system data is the same under every config
      .then(r => {
        const v = r || {},
          o = Array.isArray(v.light_order) ? v.light_order : null;
        const same = JSON.stringify(v) === JSON.stringify(this.sysData || {});
        this.sysData = v;
        if (this.lightDrag || (same && JSON.stringify(o) === JSON.stringify(this.lightOrder || null))) return;
        this.lightOrder = o;
        this.tick();
      })
      .catch(() => {});
  }
  saveLightOrder(keys) {
    this.lightOrder = keys;
    const v = {...(this.sysData || {}), light_order: keys};
    this.sysData = v;
    this.api
      .setSystemData(LIGHT_ORDER_KEY, v)
      .then(() => this.toast(keys ? 'Light order saved' : 'Light order reset'))
      .catch(e => this.toast(`Couldn't save the light order: ${e.message || e.code || e}`, true));
  }
  setLightEdit(on) {
    this.lightEdit = on;
    const p = this.$('pane-lights');
    if (p) p.classList.toggle('ledit', on);
    const b = this.$('ledit');
    if (b) {
      b.textContent = on ? 'Done' : 'Arrange';
      b.setAttribute('aria-pressed', on);
    }
    this.tick();
  }
  renderLights() {
    if (this.lightDrag) return;
    const A = this.lightAreas(),
      isOn = i => (this.st(i) || {}).state === 'on';
    if (!A.length) {
      this.set(
        'lights',
        '<div class="top"><span class="lbl">Lights</span><span class="right">No lights found</span></div>',
      );
      return;
    }
    const lit = A.flatMap(a => a.ids).filter(isOn).length;
    this.set(
      'lights',
      `<div class="top"><span class="lbl">Lights</span><span class="right">${lit ? `${plural(lit, 'light')} on<button type="button" class="more" data-l="alloff">All off</button>` : 'All off'}</span></div><div class="lrows">${this.lightGrid(A)}</div>`,
    );
  }
  // the tiles, a linked pair drawn as one block of two
  lightGrid(A) {
    return A.map(a =>
      !a.link
        ? this.lightCell(a)
        : !a.link.first
          ? ''
          : this.linkPair(a, this.lightCell(a) + this.lightCell(a.link.other)),
    ).join('');
  }
  // what an area's lights are doing: which are on, the mean brightness and colour temperature, the tint, the colour range
  lightState(a) {
    const isOn = i => (this.st(i) || {}).state === 'on',
      on = a.ids.filter(isOn),
      avail = a.ids.some(i => ok(this.st(i))),
      any = on.length > 0;
    const br = any ? Math.max(1, Math.round(sum(on.map(i => this.attr(i, 'brightness') || 0)) / on.length / 2.55)) : 0;
    const tw = i => (this.attr(i, 'supported_color_modes') || []).includes('color_temp'),
      tws = a.ids.filter(tw);
    let ct = null;
    if (tws.length) {
      const mins = tws.map(i => this.attr(i, 'min_color_temp_kelvin')).filter(Boolean),
        maxs = tws.map(i => this.attr(i, 'max_color_temp_kelvin')).filter(Boolean);
      const min = Math.ceil((mins.length ? Math.max(...mins) : 2000) / 50) * 50,
        max = Math.floor((maxs.length ? Math.min(...maxs) : 6500) / 50) * 50;
      const ks = on
          .filter(tw)
          .map(i => this.attr(i, 'color_temp_kelvin'))
          .filter(x => x != null),
        k = ks.length ? Math.round(sum(ks) / ks.length / 50) * 50 : Math.round((min + max) / 100) * 50;
      if (max > min) ct = {min, max, k: Math.max(min, Math.min(max, k)), known: ks.length > 0};
    }
    return {on, any, avail, br, ct, k: ct && ct.known ? ct.k : null, tint: any ? this.lightTint(on) : ''};
  }
  // who's in charge: Auto = Adaptive Lighting on and none of the lights taken over by hand; Night = its sleep mode
  lightMode(a) {
    const isOn = i => (this.st(i) || {}).state === 'on',
      alOn = !!(a.al && isOn(a.al));
    const night = a.al && this.st(a.al + '_sleep_mode') ? a.al + '_sleep_mode' : null,
      nightOn = !!(night && isOn(night));
    const man = alOn && (this.attr(a.al, 'manual_control') || []).some(l => a.ids.includes(l) || a.units.includes(l));
    return {
      alOn,
      night,
      nightOn,
      manual: man,
      auto: alOn && !man,
      mode: nightOn && alOn ? 'Night' : alOn && !man ? 'Auto' : a.al ? 'Manual' : '',
    };
  }
  // `short`: the phone's tile has no room for the colour temperature; the sheet and the tablet keep it
  lightSub(a, s, m, short = false) {
    if (!s.avail) return 'Unavailable';
    if (!s.any) return 'Off';
    return [
      s.on.length < a.ids.length ? `${s.on.length} of ${a.ids.length} on` : '',
      s.br + '%',
      m.mode || (s.k && !short ? s.k + ' K' : ''),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  // one room as an Apple Home style tile: the bulb switches it, the rest of the tile opens its sheet
  lightCell(a) {
    const s = this.lightState(a),
      m = this.lightMode(a),
      sub = this.lightSub(a, s, m, this.compact),
      aid = esc(a.aid);
    return `<div class="lcell${s.any ? ' on' : ''}${s.avail ? '' : ' na'}" data-lsheet="${aid}" role="button" tabindex="0" aria-label="${esc(a.name)}: ${this.lightSub(a, s, m)}${a.link ? ' · ' + esc(a.link.other.name) : ''}"${s.tint ? ` style="--lc:${s.tint}"` : ''}>
      <button type="button" class="lbulb" role="switch" aria-checked="${s.any}" aria-label="${esc(a.name)} lights" data-l="area" data-a="${aid}" ${s.avail ? '' : 'disabled'}>${ico('bulb', 22)}</button>
      <span class="tx"><b>${esc(a.name)}</b> <small>${sub}${this.linkTag(a)}</small></span><span class="lchev" aria-hidden="true">${ico('chev', 18)}</span><span class="lgrip" aria-hidden="true">${ico('grip', 20)}</span></div>`;
  }
  // the colour an area's lights are showing: the first lit bulb's rgb_color, or its colour temperature turned into a warm-to-cool white
  lightTint(on) {
    for (const i of on) {
      const rgb = this.attr(i, 'rgb_color'),
        k = this.attr(i, 'color_temp_kelvin'),
        mode = this.attr(i, 'color_mode');
      if (rgb && !['color_temp', 'white', 'brightness', 'onoff'].includes(mode))
        return `rgb(${rgb.slice(0, 3).join(',')})`;
      if (k) return kelvinRGB(k);
    }
    return '';
  }
  // a linked tile's subtitle names the room it moves with
  linkTag(a) {
    return a.link ? ` · <em class="lkd">${ico('link', 13)}${esc(a.link.other.name)}</em>` : '';
  }
  // two linked tiles drawn as one block
  linkPair(a, inner) {
    const tint = this.lightTint(a.ids.concat(a.link.other.ids).filter(i => (this.st(i) || {}).state === 'on'));
    return `<div class="llink on"${tint ? ` style="--lc:${tint}"` : ''}>${inner}</div>`;
  }
  lightCmd(kind, key, v) {
    const A = this.lightAreas(),
      isOn = i => (this.st(i) || {}).state === 'on',
      AL = this.hass.services && this.hass.services.adaptive_lighting;
    if (kind === 'alloff') {
      const ids = A.flatMap(x => x.ids).filter(isOn);
      if (ids.length) this.call('light', 'turn_off', {entity_id: ids});
      return;
    }
    if (kind === 'one') {
      this.call('light', 'toggle', {entity_id: key});
      return;
    }
    const a = A.find(x => x.aid === key);
    if (!a) return;
    // a linked pair acts as one room
    const pair = a.link ? [a, a.link.other] : [a],
      all = pair.flatMap(x => x.ids),
      on = all.filter(isOn);
    // back to the schedule: Adaptive Lighting on and nothing held by hand
    const resume = (ids, al) => {
      if (!isOn(al)) this.call('switch', 'turn_on', {entity_id: al});
      if (AL) this.call('adaptive_lighting', 'set_manual_control', {entity_id: al, lights: ids, manual_control: false});
    };
    if (kind === 'pick' || kind === 'back') {
      this.lightPick = kind === 'pick';
      this.renderLightSheet();
      const f = this.$('lsheet').querySelector(this.lightPick ? '.lback' : '.lnav');
      if (f) f.focus({preventScroll: true, focusVisible: false});
      return;
    }
    if (kind === 'linkto') {
      this.linkTo(a, v || '', A);
      return;
    }
    if (kind === 'area') {
      this.call('light', a.ids.some(isOn) ? 'turn_off' : 'turn_on', {entity_id: all});
      return;
    }
    if (kind === 'al') {
      // Auto on: the schedule takes the room back (Night stays as it was); Auto off: Adaptive Lighting lets go, and Night with it
      const auto = pair.every(x => !x.al || this.lightMode(x).auto);
      for (const x of pair) {
        if (!x.al) continue;
        if (!auto) resume(x.ids, x.al);
        else {
          this.call('switch', 'turn_off', {entity_id: x.al});
          const n = this.lightMode(x).night;
          if (n && isOn(n)) this.call('switch', 'turn_off', {entity_id: n});
        }
      }
      this.toast(auto ? 'Auto off' : 'Auto on');
      return;
    }
    if (kind === 'night') {
      // Night needs Adaptive Lighting, so turning it on also hands the room back to Auto
      const m = this.lightMode(a),
        going = !(m.nightOn && m.alOn);
      for (const x of pair) {
        const mx = this.lightMode(x);
        if (!mx.night) continue;
        this.call('switch', going ? 'turn_on' : 'turn_off', {entity_id: mx.night});
        if (going) resume(x.ids, x.al);
      }
      this.toast(going ? 'Night on' : 'Night off');
      return;
    }
    if (kind !== 'br' && kind !== 'ct') return;
    // brightness or colour by hand: the room leaves Auto and Night until Auto is turned on again
    const took = pair.filter(x => x.al && (this.lightMode(x).auto || this.lightMode(x).nightOn));
    for (const x of took) {
      const mx = this.lightMode(x);
      if (mx.nightOn) this.call('switch', 'turn_off', {entity_id: mx.night});
      if (AL)
        this.call('adaptive_lighting', 'set_manual_control', {entity_id: x.al, lights: x.ids, manual_control: true});
      else this.call('switch', 'turn_off', {entity_id: x.al});
    }
    if (kind === 'br') {
      if (v < 1) this.call('light', 'turn_off', {entity_id: all});
      else this.call('light', 'turn_on', {entity_id: on.length ? on : all, brightness_pct: v});
    } else {
      const ids = (on.length ? on : all).filter(i =>
        (this.attr(i, 'supported_color_modes') || []).includes('color_temp'),
      );
      if (!ids.length) return;
      this.call('light', 'turn_on', {entity_id: ids, color_temp_kelvin: v});
    }
    if (took.length) this.toast('Set by hand, Auto off');
  }
  // pick the room this one moves with (or none); the pair list is saved for the whole house, and a new partner starts out matching
  linkTo(a, other, A) {
    const cur = A.filter(t => t.link && t.link.first).map(t => [t.aid, t.link.other.aid]);
    const b = other ? A.find(x => x.aid === other) : null;
    if (other && !b) return;
    if ((a.link ? a.link.other.aid : '') === other) return;
    const next = cur.filter(p => !p.includes(a.aid) && !(other && p.includes(other)));
    if (b) next.push([a.aid, b.aid]);
    this.saveLightLinks(next, b ? 'Rooms linked' : 'Room unlinked');
    if (!b) return;
    const isOn = i => (this.st(i) || {}).state === 'on',
      mine = a.ids.filter(isOn),
      them = b.ids;
    if (!mine.length) {
      if (them.some(isOn)) this.call('light', 'turn_off', {entity_id: them});
      return;
    }
    const s = this.lightState(a),
      m = this.lightMode(a),
      tw = them.filter(i => (this.attr(i, 'supported_color_modes') || []).includes('color_temp'));
    // under Auto the colour follows on its own; a colour set by hand is copied
    if (s.k && !m.auto && tw.length) {
      this.call('light', 'turn_on', {entity_id: tw, brightness_pct: s.br, color_temp_kelvin: s.k});
      const rest = them.filter(i => !tw.includes(i));
      if (rest.length) this.call('light', 'turn_on', {entity_id: rest, brightness_pct: s.br});
    } else this.call('light', 'turn_on', {entity_id: them, brightness_pct: s.br});
  }

  // ---------- the departure schedule's words, which the stack's car card and the header's upcoming list still read until #269 ----------
  // a time of day with no date, such as the departure schedule's hours and minutes: placed on a fixed UTC day and read
  // back by the UTC set, so that neither the browser's zone nor the house's moves it
  clockTime(h, m) {
    return this.fmtUtcEn.time(Date.UTC(2026, 0, 1, h, m));
  }
  // read from the provider's schedule; the Car's controls say the same in the catalog (src/features/car/schedule.ts). Deleted by #269, the Home move, with its last readers
  schedText() {
    const sch = this.car && departureSchedule(this.hass.states, this.car);
    if (!sch) return 'No departure times saved.';
    const wk = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const d =
      sch.days.length === 7
        ? 'Every day'
        : sch.days.length === 5 && wk.every(x => sch.days.includes(x))
          ? 'Weekdays'
          : sch.days.map(x => x.slice(0, 3).replace(/^./, c => c.toUpperCase())).join(', ');
    return `${d} at ${this.clockTime(sch.hours, sch.minutes)} saved.`;
  }

  // ---------- the switch's optimistic read ----------
  // `sw`, `pending` and `call` stay for the Lights pane until it moves (spec 23, #263); the Car's controls hold their values in the panel's overlay since #253
  sw(id) {
    const p = this.pending[id];
    if (p != null && Date.now() < p.until) return p.on;
    const s = this.st(id);
    return ok(s) ? ['on', 'locked'].includes(s.state) : null;
  }
}

Object.assign(LegacyPanel.prototype, autoMethods);
