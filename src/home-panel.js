// Home panel for Home Assistant: a wall-tablet and phone dashboard (energy, climate, lights, weather, car, air, security, automations).
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
import {ok, esc, tile, plural, cap} from './legacy/globals.js';
import {loadApex} from './core/apex.ts';
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
const f0 = v => (v == null ? '–' : String(Math.round(+v)));
// a duration for the live-activity pill: 52 min, 1 h 50, 3 h
const durTxt = ms => {
  const m = Math.max(1, Math.round(ms / 6e4));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
};
const ms = v => (typeof v === 'number' ? v : Date.parse(v));
// a value from Home Assistant as a Date, or null when it is missing or not a date (the formatters throw on an invalid one)
const asDate = v => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
// a YYYY-MM-DD day key as its UTC noon, and a YYYY-MM month key as the 15th at UTC noon: read by a UTC-pinned set
// (fmtUtcEn, fmtUtc), a key names its own day and month whatever zone the browser or the house is in
const dayAt = k => new Date(k + 'T12:00:00Z');
const monthAt = k => new Date(k + '-15T12:00:00Z');
// the optional history of a heat pump or a sensor: a failed read is an empty one, but a StaleReply stays one
const noHistory = e => {
  if (e instanceof StaleReply) throw e;
  return {};
};
// tiles with nothing to show (the car's sensors it doesn't have) are left out rather than shown with a dash
const tiles = arr =>
  arr
    .filter(([, v]) => v !== '–' && !/>–<\/span>$/.test(String(v)))
    .map(tile)
    .join('');
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
const L0kw = v => (v == null ? '–' : v < 1 ? Math.round(v * 1000) + ' W' : v.toFixed(1) + ' kW');

// card order for the column packing: first row is cameras, energy
const LAYOUT = ['cams', 'sensors', 'open-energy', 'lights', 'open-climate', 'open-air', 'open-car', 'water', 'hilo'];
const DOOR_DC = ['door', 'window', 'opening', 'garage_door'],
  MOTION_DC = ['motion', 'occupancy', 'presence'];
const sensorName = n => String(n).replace(/^d[ée]tecteur\s+(de\s+)?mouvement\s+/i, '');
// thermostats without an HA area: the area each Hilo room belongs to
// areas the Phone tab shows as part of another, the way Apple Home groups them: the parking spot's charger and camera live in the garage
// AL_AREAS (from the config): HA area → Adaptive Lighting switch, for areas the panel can't match on its own
// Tabs view: one pane per subject, for a tablet fixed to the wall. Five panes host the detail sheets inline. The rail, the
// phone's bar and the panes are the shell's (src/shell/features.ts); the guest fills what is inside them.
// the sheets that wait for the charts library before they draw anything; the others never do
const CHART_SHEETS = new Set(['sh-energy', 'sh-climate', 'sh-car', 'sh-air']);
const TAB_SHEET = {climate: 'sh-climate', car: 'sh-car', energy: 'sh-energy', air: 'sh-air'};
// the tab whose pane hosts a sheet's panel
const SHEET_TAB = /** @type {Record<string, import('./ui/feature.ts').FeatureKey>} */ (
  Object.fromEntries(Object.entries(TAB_SHEET).map(([t, id]) => [id, t]))
);
// colour of a black body at k kelvin (Tanner Helland's fit), for the colour-temperature strips and sliders
const kelvinRGB = k => {
  const t = Math.min(40000, Math.max(1000, k)) / 100,
    c = v => Math.round(Math.min(255, Math.max(0, v)));
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return `rgb(${c(r)},${c(g)},${c(b)})`;
};
// air quality bands per pollutant: [good up to, moderate up to], above that is poor
// PM2.5 after the US EPA daily bands, CO2 after common ventilation guidance, TVOC after the German UBA levels, CO after the WHO 8-hour limit
const AQ = {
  pm2_5: {name: 'PM2.5', unit: 'µg/m³', b: [12, 35]},
  co2: {name: 'CO₂', unit: 'ppm', b: [800, 1200]},
  voc: {name: 'VOC', unit: 'µg/m³', b: [300, 3000]},
  co: {name: 'CO', unit: 'ppm', b: [9, 35]},
};
const AQ_LVL = [['Good'], ['Moderate'], ['Poor']];
const AIR_KEYS = [
  'pm1',
  'pm2_5',
  'pm10',
  'co',
  'co2',
  'voc',
  'humidity',
  'temperature',
  'air_quality',
  'fan_speed',
  'air_changes',
  'mode',
  'time_to_clean',
];
const POLLEN = [
  ['trees', 'Trees'],
  ['grass', 'Grass'],
  ['weeds', 'Weeds'],
  ['mold', 'Mold'],
];
const aqLevel = (k, v) => (v == null ? -1 : v <= AQ[k].b[0] ? 0 : v <= AQ[k].b[1] ? 1 : 2);
const aqFmt = (fmt, k, v, short) =>
  v == null
    ? '–'
    : short && v >= 10000
      ? Math.round(v / 1000) + 'k'
      : short && v >= 1000
        ? (v / 1000).toFixed(1) + 'k'
        : k === 'co' && v < 10
          ? (+v).toFixed(1)
          : fmt.integer(v);
// outdoor AQI on the US scale: up to 50 good, up to 100 moderate
const outLevel = v => (v == null ? 0 : v <= 50 ? 0 : v <= 100 ? 1 : 2);
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
const CARSVG = `<svg class="carside" viewBox="0 0 340 128" role="img" aria-label="Car, side view">
  <ellipse cx="172" cy="118" rx="150" ry="6" fill="var(--house-shadow)"/>
  <path d="M28 100V82c0-8 4-13 12-15l16-4c20-15 52-28 94-30 30-1 52 3 72 13l26 15c26 2 50 6 64 10 8 3 12 9 12 17v12z" fill="var(--car-body)"/>
  <path d="M60 64c22-12 50-22 90-24 26-1 48 2 68 11l18 11c-50-4-120-4-176 2z" fill="var(--car-hi)" opacity=".55"/>
  <path d="M86 60c20-11 42-17 66-18l2 18zM161 42c22 0 40 4 56 12l14 7-70-1z" fill="var(--car-glass)"/><path d="M157 41h5v20h-5z" fill="var(--car-body)"/>
  <path d="M40 68h14v4H40z" fill="#C8463C"/><path d="M302 72l16 2v3l-16-1z" fill="var(--car-lamp)"/>
  <path d="M116 94h120v6H116zM28 94h14v6H28zM312 94h14v6h-14z" fill="var(--car-clad)"/><path d="M58 100a32 30 0 0 1 64 0zM232 100a32 30 0 0 1 64 0z" fill="var(--car-clad)"/>
  <g><circle cx="90" cy="101" r="22" fill="var(--car-tire)"/><circle cx="90" cy="101" r="14" fill="var(--car-rim)"/><circle cx="90" cy="101" r="4" fill="var(--car-tire)"/></g>
  <g><circle cx="264" cy="101" r="22" fill="var(--car-tire)"/><circle cx="264" cy="101" r="14" fill="var(--car-rim)"/><circle cx="264" cy="101" r="4" fill="var(--car-tire)"/></g></svg>`;
const CARTOP = `<svg viewBox="0 0 90 170" width="90" height="170" role="img" aria-label="Car seen from above">
  <rect x="12" y="6" width="66" height="158" rx="26" fill="var(--car-body)"/><path d="M20 52c8-6 42-6 50 0l-4 22H24zM24 112h42l4 20c-8 6-42 6-50 0z" fill="var(--car-glass)"/>
  <rect x="2" y="30" width="10" height="26" rx="4" fill="var(--car-tire)"/><rect x="78" y="30" width="10" height="26" rx="4" fill="var(--car-tire)"/>
  <rect x="2" y="114" width="10" height="26" rx="4" fill="var(--car-tire)"/><rect x="78" y="114" width="10" height="26" rx="4" fill="var(--car-tire)"/></svg>`;
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
// ---------- climate helpers ----------
// history ranges for the climate sheet: statistics period, span, and how the heatmap groups cells
const CRANGE = {
  day: {
    days: 1,
    period: '5minute',
    mid: 15e4,
    label: 'last 24 hours',
    short: '24 h',
    heatTitle: 'Every room, hour by hour',
    ticks: 8,
    tipFmt: 'ddd h:mm tt',
    meanName: '5-minute mean',
    outNote: 'Band is each 5 minutes’ low to high, line is the mean',
  },
  week: {
    days: 7,
    period: 'hour',
    mid: 18e5,
    label: 'last 7 days',
    short: '7 days',
    heatTitle: 'Every room, every 6 hours',
    ticks: 7,
    tipFmt: 'ddd h tt',
    meanName: 'Hourly mean',
    outNote: 'Band is each hour’s low to high, line is the hourly mean',
  },
  month: {
    days: 30,
    period: 'hour',
    mid: 18e5,
    label: 'last 30 days',
    short: '30 days',
    heatTitle: 'Every room, every day',
    ticks: 10,
    tipFmt: 'ddd MMM d, h tt',
    meanName: 'Hourly mean',
    outNote: 'Band is each hour’s low to high, line is the hourly mean',
  },
  year: {
    days: 365,
    period: 'day',
    mid: 432e5,
    label: 'last 12 months',
    short: '12 months',
    heatTitle: 'Every room, week by week',
    ticks: 12,
    tipFmt: 'ddd MMM d, yyyy',
    meanName: 'Daily mean',
    outNote: 'Band is each day’s low to high, line is the daily mean',
  },
};
// heatmap: blue (cool) through a neutral 21–22° to red (warm); each step checked for colour-blind separation
// continuous temperature scale for the all-rooms heatmap: [°C, colour] stops, blended in OKLab
const HEAT_LO = 17,
  HEAT_HI = 26;
const HEAT_LIGHT = [
  [17, '#24467F'],
  [19, '#3F7DBF'],
  [20.5, '#8DBAD8'],
  [21.5, '#E6D9A2'],
  [23, '#EE9A52'],
  [24.5, '#CF592B'],
  [26, '#87210F'],
];
const HEAT_DARK = [
  [17, '#3561A8'],
  [19, '#4F8BCB'],
  [20.5, '#8FBAD6'],
  [21.5, '#D9C98E'],
  [23, '#EE9A52'],
  [24.5, '#D4602F'],
  [26, '#9A2C17'],
];
const lin = c => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toOk = hex => {
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q,
  ];
};
/** @param {number[]} lab */
const fromOk = ([L, A, B]) => {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3,
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3,
    q = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const g = c =>
    Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))
      .toString(16)
      .padStart(2, '0');
  return (
    '#' +
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q,
    ]
      .map(g)
      .join('')
  );
};
const heatColor = (v, stops) => {
  v = Math.min(HEAT_HI, Math.max(HEAT_LO, v));
  let i = 1;
  while (i < stops.length - 1 && v > stops[i][0]) i++;
  const [t0, c0] = stops[i - 1],
    [t1, c1] = stops[i],
    f = (v - t0) / (t1 - t0),
    a = toOk(c0),
    b = toOk(c1);
  return fromOk(a.map((x, k) => x + (b[k] - x) * f));
};
// 0.1° steps so neighbouring cells blend instead of jumping between bands
const heatRanges = stops => {
  const out = [];
  for (let k = 0; k < (HEAT_HI - HEAT_LO) * 10; k++) {
    const v = HEAT_LO + k / 10;
    out.push({
      from: k ? v : -99,
      to: k === (HEAT_HI - HEAT_LO) * 10 - 1 ? 99 : v + 0.0999,
      color: heatColor(v + 0.05, stops),
    });
  }
  return out;
};
const HVAC = {off: 'Off', heat: 'Heat', cool: 'Cool', auto: 'Auto', heat_cool: 'Auto', dry: 'Dry', fan_only: 'Fan'};
const swingName = m =>
  ({vertical: 'Swing up and down', horizontal: 'Swing side to side', both: 'Swing both ways', off: 'Fixed'})[m] ||
  (/^vertical_(\d+)$/i.test(m)
    ? `Fixed, vertical position ${m.split('_')[1]}`
    : /^horizontal_(\d+)$/i.test(m)
      ? `Fixed, horizontal position ${m.split('_')[1]}`
      : cap(m));
// heat pump readings from state history; a gap with no state means it was offline
/** @param {(attrs: any, state: string) => any} [get] what to read from a point (the default is the temperature) */
function hpSeries(rows, get = a => a.current_temperature) {
  const out = [];
  let prev = null;
  (rows || []).forEach(x => {
    const t = x.lastUpdated,
      a = x.attributes || {},
      v = x.state === 'unavailable' ? null : get(a, x.state);
    if (v == null) {
      if (out.length) out.push([t, null]);
      prev = null;
      return;
    }
    if (prev != null) out.push([t - 1, prev]);
    out.push([t, v]);
    prev = v;
  });
  return out;
}
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
    //   fmtUtc   fmt pinned to UTC, and fmtUtcEn fmtEn pinned to UTC: for a day or month key parsed at UTC noon (dayAt,
    //            monthAt) and for a clock time with no day (clockTime), neither of which belongs to any zone
    // fmtUtcEn never changes; the other three follow the profile (refreshFormatters)
    this.fmtUtcEn = createFormatters(englishLocale('UTC'));
    this.localeKey = '';
    this.frDrawn = false; // whether the panel was last drawn in French
    this.onStore = () => {
      this.refreshFormatters(); // before the render, which reads them
      this.tick();
    };
    this.unsubStore = null; // the one path to the one-second render, subscribed in connect
    this.H = null; // history-derived data
    this.charts = []; // sheet charts, destroyed on close
    this.ApexCharts = null; // the library, once the lazy chunk has loaded (loadCharts)
    this.chartsLoad = null; // the one load of the chunk
    this.sheetOffs = []; // what unregisters this draw's sheets from the shell's sheet host (build), run by teardown
    this.popupOffs = []; // the same for the two popups Escape dismisses (connect, disconnect)
    this.drawnTab = 'home'; // the tab the guest last drew its part of (tabChanged); `tab` is the shell's
    this.framed = false; // whether build() has drawn once, so the next draw asks the shell for a fresh frame
    this.frameKey = null; // what availability() said when the shell was last asked to draw the rail
    this.range = 'today';
    this.climSel = 'house';
    this.sesAll = false;
    this.cache = {}; // last innerHTML per container, to skip identical updates
    this.pending = {}; // optimistic control states until hass catches up
    this.fc = {}; // forecasts by type, told by the shell (forecastChanged) from the Weather pane's subscription; Home's card reads them
    this.crange = 'day'; // climate history range (Day by default since v1.18.2)
    this.CR = {}; // climate history by range
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
        this.loadHistory();
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
    this.H = null;
    this.CR = {};
    return true; // the caller draws it again
  }
  // forget the drawn panel so build() starts over (the language or the config changed)
  teardown() {
    this.frStop();
    this.charts.forEach(c => c.destroy());
    this.charts = [];
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
    this.camT = setInterval(() => {
      if (this.hass && this.$app && !document.hidden) this.renderCameras();
    }, 10000);
    this.histT = setInterval(() => this.loadHistory(), 15 * 60000);
    // Escape closes the sheet, then the Status checks, then the settings popup: the host owns the order, these two are its last
    this.popupOffs = [
      this.sheets.registerPopup({
        isOpen: () => !!this.$app && !this.$('attpop').hidden,
        close: () => {
          this.toggleAttention(false);
          this.renderHeader();
        },
      }),
    ];
    this.$('iwrap').addEventListener('click', this.onIdleClick);
    if (this.hass && this.$app) this.loadHistory();
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
    clearTimeout(this.glowT);
    if (this.ro) this.ro.disconnect();
    clearInterval(this.clockT);
    clearInterval(this.camT);
    clearInterval(this.histT);
    this.popupOffs.forEach(off => off());
    this.popupOffs = [];
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
  // group a [t, value] series into heatmap cells: hours (day), 6-hour blocks (week), days (month), weeks (year)
  bucket(pts, r) {
    const m = new Map();
    pts.forEach(([t, v]) => {
      if (v == null) return;
      const p = this.fmtEn.dayParts(t);
      let k, lbl;
      // labels stay unique (apex groups cells by label); the axis formatter shortens them
      if (r === 'day') {
        k = p.day + ' ' + String(p.h).padStart(2, '0');
        lbl = `${p.wd}, ${this.fmtEn.hour(t)}`;
      } else if (r === 'week') {
        const b = Math.floor(p.h / 6) * 6;
        k = p.day + ' ' + String(b).padStart(2, '0');
        lbl = `${p.wd} ${+p.day.slice(8)}, ${['night', 'morning', 'afternoon', 'evening'][b / 6]}`;
      } else if (r === 'month') {
        k = p.day;
        lbl = this.fmtUtcEn.date(dayAt(p.day));
      } else {
        const d = dayAt(p.day),
          mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
        k = mon.toISOString().slice(0, 10);
        lbl = this.fmtUtcEn.date(dayAt(k));
      }
      const c = m.get(k) || {k, lbl, s: 0, n: 0};
      c.s += v;
      c.n++;
      m.set(k, c);
    });
    return [...m.values()].sort((a, b) => (a.k < b.k ? -1 : 1)).map(c => [c.k, c.lbl, +(c.s / c.n).toFixed(2)]);
  }
  $(id) {
    return this.root.getElementById(id);
  }
  css(n) {
    return getComputedStyle(this.$app).getPropertyValue(n).trim();
  }
  dark() {
    return this.ctx.shell.appearance.theme === 'dark';
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
    // the shell drew the frame (the header, the rail, the panes); the guest draws what is not in it: the parked cards, the sheets, the idle clock, the toast
    this.container.innerHTML = `<div class="cols">
    <div class="col c1">
      <div class="card tap" id="open-energy" tabindex="0" role="button" aria-description="Open home energy details"><div id="energy"></div></div>
    </div>
    <div class="col c2">
      <div class="card camcard" id="cams"></div>
      <div class="card" id="sensors" hidden></div>
      <div class="card" id="lights"></div>
      <div class="card tap" id="open-climate" tabindex="0" role="button" aria-description="Open climate details"><div id="climate"></div></div>
      <div class="card tap" id="open-air" tabindex="0" role="button" aria-description="Open air quality details"><div id="air"></div></div>
    </div>
    <div class="col c3">
      <div class="card tap carcard" id="open-car" tabindex="0" role="button" aria-description="Open car details"><div id="carcard"></div></div>
      <div class="card" id="water"></div>
      <div class="card" id="hilo"></div>
    </div>
  </div>

<div class="sheet" id="sh-energy" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="eh">
  <div class="ph"><span class="badge" style="--acc:var(--c-grid)"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg></span>
    <div class="grow"><h2 id="eh">Home energy</h2><div class="sub" id="esub"></div></div>
    <div class="tabs" role="tablist" id="etabs"><button class="tab" role="tab" aria-selected="true" data-r="today">Today</button><button class="tab" role="tab" aria-selected="false" data-r="week">Week</button><button class="tab" role="tab" aria-selected="false" data-r="month">Month</button><button class="tab" role="tab" aria-selected="false" data-r="year">Year</button></div>
    <button class="icon close" type="button" aria-label="Close">✕</button></div>
  <div class="inner"><h3 id="et"></h3><p id="es"></p><div class="legend" id="el"></div><div id="c-main"></div></div>
  <div class="inner" style="margin-top:14px"><div class="shead"><div><h3>Where the power goes</h3><p id="skp"></p></div>
    <div class="tabs" role="tablist" id="stabs" aria-label="Sankey period"><button class="tab" role="tab" aria-selected="true" data-s="now">Now</button><button class="tab" role="tab" aria-selected="false" data-s="today">Today</button><button class="tab" role="tab" aria-selected="false" data-s="d30">30 days</button></div></div>
    <div class="sankey" id="sankey"></div></div>
  <div class="two">
    <div class="inner"><h3>Where it went</h3><p>Last 30 days. Rest of home is everything without its own power sensor, including the heat pump.</p><div class="donut"><div id="c-donut" style="width:190px"></div><table id="dt"></table></div></div>
    <div class="inner"><h3>Totals</h3><p>From the Hilo smart meter</p><div class="totals" id="tot"></div></div>
  </div></div></div>

<div class="sheet" id="sh-climate" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="ch">
  <div class="ph"><span class="badge" style="--acc:var(--c-home)"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a2 2 0 0 1 4 0v10.3a4.5 4.5 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="2" fill="currentColor"/></svg></span>
    <div class="grow"><h2 id="ch">Home climate</h2><div class="sub" id="csub"></div></div>
    <div class="tabs" role="tablist" id="ctabs"><button class="tab" role="tab" aria-selected="true" data-r="day">Day</button><button class="tab" role="tab" aria-selected="false" data-r="week">Week</button><button class="tab" role="tab" aria-selected="false" data-r="month">Month</button><button class="tab" role="tab" aria-selected="false" data-r="year">Year</button></div>
    <button class="icon close" type="button" aria-label="Close">✕</button></div>
  <div class="clim"><div class="clist" id="clist" role="listbox" aria-label="Rooms"></div><div class="inner cdet" id="cdet" aria-live="polite"></div></div>
  <div class="inner" id="cheatwrap"><h3 id="cheath">Every room</h3><p>Mean temperature per room, on a smooth scale from cool blue to warm red.</p><div class="hleg" id="cheatl"></div><div id="c-heat"></div></div>
  <div class="inner" id="coutwrap"><h3 id="couth">Outside</h3><p id="coutp"></p><div class="legend"><span><b style="background:color-mix(in srgb,var(--c-home) 35%,transparent)"></b>Low to high</span><span><b style="background:var(--c-home)"></b>Mean</span></div><div id="c-out90"></div></div>
</div></div>

<div class="sheet" id="sh-air" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="ah">
  <div class="ph"><span class="badge" style="--acc:var(--ok)"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/></svg></span>
    <div class="grow"><h2 id="ah">Air quality</h2><div class="sub" id="asub"></div></div>
    <div class="tabs" role="tablist" id="atabs"><button class="tab" role="tab" aria-selected="true" data-r="day">Day</button><button class="tab" role="tab" aria-selected="false" data-r="week">Week</button><button class="tab" role="tab" aria-selected="false" data-r="month">Month</button></div>
    <button class="icon close" type="button" aria-label="Close">✕</button></div>
  <div class="aqrooms" id="arooms"></div>
  <div class="inner"><h3 id="aqch">History</h3><p id="aqcp"></p>
    <div class="seg aqmetric" role="radiogroup" aria-label="What to chart" id="ametric">${[
      ['pm2_5', 'PM2.5'],
      ['co2', 'CO₂'],
      ['voc', 'VOC'],
      ['humidity', 'Humidity'],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" role="radio" data-m="${k}" aria-checked="${k === 'pm2_5'}"><b>${l}</b></button>`,
      )
      .join('')}</div>
    <div class="legend" id="alegend"></div><div id="c-air"><p class="loading">Loading history…</p></div></div>
  <div class="inner"><h3>Outside</h3><p>From the Mila outdoor station nearest your home, and Environment Canada's Air Quality Health Index.</p><div id="aout"></div>
    <h3 id="aoh" style="margin-top:18px">Outdoor air</h3><p>US AQI from the station (good up to 50, moderate up to 100) and the AQHI on its 1 to 10 scale.</p><div class="legend" id="aolegend"></div><div id="c-aout"></div></div>
</div></div>

<div class="sheet" id="sh-car" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="carh">
  <div class="ph"><span class="badge" style="--acc:var(--c-ev)">${ico('car', 26)}</span>
    <div class="grow"><h2 id="carh">Car</h2><div class="sub" id="carsub"></div></div>
    <button class="icon close" type="button" aria-label="Close">✕</button></div>
  <div class="two"><div class="inner" id="car-bat"></div><div class="inner" id="car-status"></div></div>
  <div class="two"><div class="inner" id="car-charger"></div><div class="inner" id="car-comfort"></div></div>
  <div class="inner"><h3>Charging history</h3><p id="sesp"></p><div class="tiles" id="sest" style="margin-bottom:6px"></div><div id="c-carmon"></div>
    <table class="slist"><thead><tr><th>Date</th><th class="hide-s">Time</th><th class="r hide-s">Length</th><th>Energy</th><th class="r hide-s">Peak</th><th class="r">Est. cost</th></tr></thead><tbody id="slist"></tbody></table>
    <button class="more" type="button" id="smore"></button></div>
  <div class="two"><div class="inner" id="car-ford"></div><div class="inner" id="car-last"></div></div>
</div></div>
<div class="sheet" id="sh-sens" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sensh">
  <div class="ph"><span class="badge" id="sensbadge" style="--acc:var(--c-home)">${ico('door', 26)}</span>
    <div class="grow"><h2 id="sensh">History</h2><div class="sub" id="senssub"></div></div>
    <div class="tabs" role="tablist" id="senstabs">${['day', 'week'].map(r => `<button class="tab" role="tab" aria-selected="${r === 'day'}" data-r="${r}">${cap(r)}</button>`).join('')}</div>
    <button class="icon close" type="button" aria-label="Close">✕</button></div>
  <div class="inner"><h3 id="senst"></h3><div id="sensbody"><p class="loading">Loading history…</p></div></div>
  <div class="inner" style="margin-top:16px"><h3>Over the period</h3><div class="tiles" id="sensstats" style="margin-top:10px"></div></div>
</div></div>
<div class="sheet" id="sh-cam" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="camh">
  <div class="ph"><span class="badge" style="--acc:var(--c-home)">${ico('cam', 26)}</span>
    <div class="grow"><h2 id="camh">Camera</h2><div class="sub" id="camsub"></div></div>
    <button class="icon close" type="button" aria-label="Close">✕</button></div>
  <div class="camlive" id="camlive"></div>
</div></div>
<div class="sheet" id="sh-light" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="lshh">
  <div class="ph"><button type="button" class="lpwr" id="lshpwr" role="switch" aria-checked="false" data-l="area" data-a="">${ico('lpow', 24)}</button><div class="grow"><h2 id="lshh"></h2><div class="sub" id="lshsub"></div></div><button class="close ldone" type="button">Done</button></div>
  <div class="lsbody" id="lsheet"></div>
</div></div>
<div class="sheet" id="sh-card" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="cardh">
  <div class="ph"><span class="badge" id="cardb"></span><div class="grow"><h2 id="cardh"></h2></div><button class="icon close" type="button" aria-label="Close">✕</button></div>
  <div id="cardhost"></div>
</div></div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
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
    // hidden while it says it has nothing, as the legacy row was. The Home move (#268) deletes the Home-card bridge and its host.
    const hs = this.$('hscenes');
    hs.innerHTML = '<hp-scene-tiles></hp-scene-tiles>';
    hs.addEventListener('hp-empty', e => {
      hs.hidden = e.detail.empty;
    });
    this.wire();
    // the host takes the scrim and the Close button of each sheet, and places the five detail panels for the shape of the screen
    this.sheetOffs = [...this.root.querySelectorAll('.guest .sheet')].map(el =>
      this.sheets.registerLegacy({
        id: /** @type {import('./shell/sheet-host.ts').LegacySheetId} */ (el.id),
        element: el,
        inline: SHEET_TAB[el.id] && {
          pane: SHEET_TAB[el.id],
          host: SHEET_TAB[el.id] === 'energy' ? 'ehost' : 'pane-' + SHEET_TAB[el.id],
        },
      }),
    );
    this.observeLayout();
    this.ctx.shell.idle.arm(); // a draw counts as a touch, as it did: the five minutes start over, and an idle panel wakes
    // the first render (setView → renderTabs) gates the Car tab and tile, so it must already know the car; renderLive looks again
    this.findCar();
    this.setView();
    this.lensAll();
    this.loadHistory();
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
      this.redrawCharts();
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
      L = this.live();
    const ins = L.rooms.map(r => r.t).filter(v => v != null),
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
    const X = this.sensors(),
      doors = X.filter(x => x.kind === 'door');
    const areas = this.lightAreas();
    // red: a door open 5 min or more, lights that stopped answering for 5 min (pinned until fixed)
    doors
      .filter(x => (this.st(x.id) || {}).state === 'on' && mins(this.st(x.id).last_changed) >= 5)
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
    const C = this.car ? this.carState() : null;
    if (C && C.home !== false && !C.plugged && C.soc != null && C.soc < 40 && inHours(h, 21, 6))
      out.push(
        this.scard('carlow', {
          ic: 'car',
          label: `${this.carName()} not plugged in`,
          color: 'var(--warn)',
          tone: 'amber',
          go: 'sh-car',
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
    const pk = this.st(this.E.hqPeak),
      pu = this.st(this.E.hqUpcoming),
      defi = this.st(this.E.defi);
    if ((pk && pk.state === 'on') || (pu && pu.state === 'on'))
      out.push(
        this.scard('peak', {
          ic: 'bolt',
          label: pk && pk.state === 'on' ? 'Critical peak now' : 'Critical peak coming',
          color: 'var(--crit)',
          right: 'Hydro-Québec',
          go: 'sh-energy',
          body: mid(pk && pk.state === 'on' ? 'Lower consumption now' : 'Hydro-Québec announced a critical peak'),
          foot: `Using ${L0kw(this.live().grid)} right now`,
        }),
      );
    else if (ok(defi) && defi.state !== 'off')
      out.push(
        this.scard('peak', {
          ic: 'bolt',
          label: 'Hilo challenge',
          color: 'var(--crit)',
          right: 'Hilo',
          go: 'sh-energy',
          body: mid(String(defi.state)),
          foot: `Using ${L0kw(this.live().grid)} right now`,
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
        ins = this.live()
          .rooms.map(r => r.t)
          .filter(v => v != null);
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
    try {
      const P2 = this.purifiers();
      P2.rooms.forEach(r => {
        const a = this.roomAir(r),
          bad = a.lv.filter(x => x.l >= 2).sort((x, y) => y.l - x.l)[0];
        if (!bad) return;
        out.push(
          this.scard('air', {
            ic: 'wind',
            label: `${r.name} air`,
            color: 'var(--m-teal)',
            go: 'sh-air',
            body: big(aqFmt(this.fmtEn, bad.k, bad.v), ' ' + AQ[bad.k].unit) + mid(`${AQ[bad.k].name} is high`),
            foot: bad.k === 'co2' ? 'Open a door or a window a little' : 'The purifier can run faster',
          }),
        );
      });
    } catch {
      /* no Mila purifiers */
    }
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
          label: this.carName(),
          color: 'var(--c-ev)',
          right: C.charging ? 'Charging' : 'Plugged in',
          go: 'sh-car',
          body: `<div class="srow">${this.sring(C.soc, C.lim, 'var(--ok)')}<div class="skv">${p != null && p > 0.05 ? `<div><small>Power</small><b class="num">${p.toFixed(1)} kW</b></div>` : ''}${C.range != null ? `<div><small>Range</small><b class="num">${Math.round(C.range)} km</b></div>` : ''}${C.lim ? `<div><small>Limit</small><b class="num">${C.lim}%</b></div>` : ''}</div></div>`,
          foot:
            dep && !/^No /.test(dep)
              ? `Departure: ${dep.replace(/ saved\.$/, '')}`
              : C.charging
                ? `Charging to ${C.lim || 100}%`
                : 'Not charging right now',
        }),
      );
    }
    // fillers, when nothing else applies: energy used today in the daytime, and who's home
    const T = this.H && this.H.totals,
      F = this.H && this.H.flow;
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
          go: 'sh-energy',
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
    if (go.startsWith('sens:')) return this.openSens(go.slice(5));
    if (go.startsWith('tab:')) {
      const t = go.slice(4);
      if (this.availability()[t] !== false) this.ctx.shell.setTab(t);
      return;
    }
    if (go.includes('.') || this.$(go)) this.sheets.open(go);
  }
  // Attention glow (v1.19.6): when a door opens or motion starts, the Security card's edge pulses amber for about 2.5 s
  secWatch() {
    const now = {};
    for (const x of this.sensors()) now[x.id] = (this.st(x.id) || {}).state === 'on';
    const was = this.secWas;
    this.secWas = now;
    if (!was || !Object.keys(now).some(id => now[id] && was[id] === false)) return;
    const el = this.$('hsec');
    el.classList.remove('glow');
    void el.offsetWidth;
    el.classList.add('glow');
    clearTimeout(this.glowT);
    this.glowT = setTimeout(() => el.classList.remove('glow'), 2800);
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
    this.$('gear').addEventListener('click', () => {
      this.toggleAttention(false);
      this.renderHeader();
    });
    this.$('toast').addEventListener('click', () => {
      this.$('toast').hidden = true;
    });
    [
      ['open-energy', 'sh-energy'],
      ['open-climate', 'sh-climate'],
      ['open-air', 'sh-air'],
      ['open-car', 'sh-car'],
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
    this.$('etabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b) return;
      this.root.querySelectorAll('#etabs .tab').forEach(t => t.setAttribute('aria-selected', t === b));
      this.range = b.dataset.r;
      this.energyMain();
    });
    this.$('attpop').addEventListener('click', e => this.laClick(e));
    this.$('chips').addEventListener('click', e => {
      if (e.target.closest('.attchip')) {
        e.stopPropagation();
        this.toggleAttention();
        this.renderHeader();
      }
    });
    this.root.addEventListener('click', e => {
      const pop = this.$('attpop');
      if (!pop.hidden && !e.composedPath().some(n => n === pop || (n.classList && n.classList.contains('attchip')))) {
        this.toggleAttention(false);
        this.renderHeader();
      }
      const sp = this.$('setpop');
      if (!sp.hidden && !e.composedPath().some(n => n === sp || n === this.$('gear'))) this.ctx.shell.closeSettings();
    });
    this.$('cams').addEventListener('click', e => {
      const b = e.target.closest('[data-cam]');
      if (b) this.openCamera(b.dataset.cam);
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
      const hc = e.target.closest('#hsec [data-cam]');
      if (hc) return this.openCamera(hc.dataset.cam);
      if (e.target.closest('button[data-l]')) return; // light switches on the phone rows: the lights listener has them
      // phone: tiles open sheets
      const sh = e.target.closest('[data-opens]');
      if (sh) return this.sheets.open(sh.dataset.opens);
      const cd = e.target.closest('[data-card]');
      if (cd) return this.openCard(cd.dataset.card, cd.dataset.title, cd.dataset.icon, cd.dataset.color);
      const ls = e.target.closest('[data-lsheet]');
      if (ls) return this.openLight(ls.dataset.lsheet);
      const cs = e.target.closest('[data-csel]');
      if (cs) {
        this.climSel = cs.dataset.csel;
        return this.sheets.open('sh-climate');
      }
      const sn = e.target.closest('[data-sens]');
      if (sn) return this.openSens(sn.dataset.sens);
      const t = e.target.closest('[data-pane]');
      if (t) return this.ctx.shell.setTab(t.dataset.pane);
    };
    tv.addEventListener('click', onTap);
    this.$('sh-card').addEventListener('click', onTap); // a card moved into the generic sheet keeps its buttons working
    this.$('stabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b) return;
      this.smode = b.dataset.s;
      this.renderSankey();
    });
    this.$('ctabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b || b.dataset.r === this.crange) return;
      this.crange = b.dataset.r;
      this.climateSheet();
    });
    this.$('cdet').addEventListener('click', e => this.climateControl(e));
    const cd = this.$('cdet'),
      dialAt = e => e.target.closest('.dial.ed');
    cd.addEventListener('pointerdown', e => {
      const d = dialAt(e);
      if (!d || e.button) return;
      e.preventDefault();
      this.dialDrag = true;
      d.setPointerCapture(e.pointerId);
      this.applySp(this.dialValue(d, e.clientX, e.clientY));
    });
    cd.addEventListener('pointermove', e => {
      const d = dialAt(e);
      if (!d || !this.dialDrag) return;
      const v = this.dialValue(d, e.clientX, e.clientY);
      if (v !== this.dialLast) {
        this.dialLast = v;
        this.applySp(v);
      }
    });
    for (const t of ['pointerup', 'pointercancel'])
      cd.addEventListener(t, () => {
        if (!this.dialDrag) return;
        this.dialDrag = false;
        this.dialLast = null;
        this.cache.chead = null;
        this.renderClimateHead();
      });
    cd.addEventListener('keydown', e => {
      const d = dialAt(e);
      if (!d || !['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) return;
      e.preventDefault();
      const cur = +d.getAttribute('aria-valuenow'),
        lo = +d.dataset.lo,
        hi = +d.dataset.hi;
      let v = cur + (/Up|Right/.test(e.key) ? 0.5 : -0.5);
      if (cur <= 5.5 && v > cur) v = 15;
      v = Math.min(hi, Math.max(lo, v));
      this.applySp(v <= 5.5 ? lo : v);
      const n = this.$('cdet').querySelector('.dial.ed');
      n && n.focus();
    });
    this.panels['sh-air'].addEventListener('click', e => this.airControl(e));
    this.$('senstabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b || b.dataset.r === this.sensRange) return;
      this.sensRange = b.dataset.r;
      this.sensSheet();
    });
    this.$('cdet').addEventListener('change', e => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (t.id === 'hpswing') {
        const v = t.value;
        this.pending['hp:swing'] = {v, until: Date.now() + 20000};
        this.call(
          'climate',
          'set_swing_mode',
          {entity_id: this.E.hp, swing_mode: v},
          `Louvers: ${swingName(v).toLowerCase()}`,
        );
      }
    });
    this.$('clist').addEventListener('click', e => {
      const b = e.target.closest('.citem');
      if (!b) return;
      this.climSel = b.dataset.id;
      this.cache.clist = null;
      this.renderClimateList();
      this.climateDetail();
    });
    // Ford's photo comes through HA's image proxy; if it fails to load, fall back to the drawn car
    this.root.addEventListener(
      'error',
      e => {
        if (e.target.classList && e.target.classList.contains('carimg') && !this.imgFail) {
          this.imgFail = true;
          this.cache = {};
          this.renderLive();
          if (this.sheets.isOpen('sh-car')) this.renderCarSheetLive();
        }
      },
      true,
    );
    this.$('smore').addEventListener('click', () => {
      this.sesAll = !this.sesAll;
      this.renderSessions();
    });
    this.panels['sh-car'].addEventListener('click', e => this.carControl(e));
    this.panels['sh-car'].addEventListener('change', e => {
      if (e.target.id === 'deptime') this.depDraft.time = e.target.value;
      this.renderCarControls();
    });
  }

  // a confirmation shows for 3.5 s; an error (sticky) stays until it is tapped or dismissed
  toast(msg, sticky) {
    const t = this.$('toast');
    clearTimeout(this.toastT);
    t.classList.toggle('err', !!sticky);
    t.setAttribute('role', sticky ? 'alert' : 'status');
    if (sticky) {
      t.innerHTML = `<span>${esc(msg)}</span><button type="button" class="tdis">Dismiss</button>`;
      t.hidden = false;
      return;
    }
    t.textContent = msg;
    t.hidden = false;
    this.toastT = setTimeout(() => {
      t.hidden = true;
    }, 3500);
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
      this.renderCarControls();
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
    this.findCar();
    for (const f of [
      'renderHeader',
      'renderEnergy',
      'renderCameras',
      'renderSensors',
      'secWatch',
      'renderLights',
      'renderClimate',
      'renderAir',
      'renderCarCard',
      'renderWater',
      'renderHilo',
    ]) {
      try {
        this[f]();
      } catch (e) {
        console.error('home-panel', f, e);
      }
    }
    this.renderTabs();
    try {
      if (this.sheets.isOpen('sh-air')) this.renderAirLive();
      if (this.sheets.isOpen('sh-light')) this.renderLightSheet();
      if (this.sheets.isOpen('sh-climate')) {
        this.renderClimateList();
        this.$('csub').textContent = this.climateSummary();
      }
      if (this.sheets.isOpen('sh-car')) this.renderCarSheetLive();
      if (this.sheets.isOpen('sh-energy')) {
        this.$('esub').textContent = this.energySummary();
        if ((this.smode || 'now') === 'now') this.renderSankey();
      }
      if (this.sheets.isOpen('sh-climate')) {
        this.renderClimateHead();
        this.renderClimateControls();
      }
      if (!this.$('attpop').hidden) this.renderAttention();
    } catch (e) {
      console.error('home-panel sheet', e);
    }
  }

  // ---------- live values ----------
  live() {
    const grid = this.kw(this.E.grid),
      wh = this.kw(this.E.whP) || 0,
      ev = this.kw(this.E.evP) || 0;
    const rooms = this.ROOMS.map(r => {
      const c = this.st(r.climate),
        p = this.kw(r.power) || 0;
      const t =
        ok(c) && c.attributes.current_temperature != null ? +c.attributes.current_temperature : this.num(r.temp);
      const sp = ok(c) ? c.attributes.temperature : null;
      const heating = (ok(c) && c.attributes.hvac_action === 'heating') || p > 0.05;
      return {...r, name: this.roomName(r), t, sp, p, heating, ok: ok(c)};
    });
    const heat = sum(rooms.map(r => r.p));
    const hp = this.st(this.E.hp),
      hpOn = ok(hp) && ['heating', 'cooling'].includes(hp.attributes.hvac_action);
    return {grid, wh, ev, heat, rest: grid == null ? null : Math.max(0, grid - wh - ev - heat), rooms, hp, hpOn};
  }
  roomName(r) {
    // in French, the room names from the Hilo thermostats themselves ("Thermostat Salle de Séjour"); that rule picks the
    // name, and the display names then read it (the name it picked is a name, not an id, so only an override by that
    // exact name or the room dictionary can change it)
    const given = this.store.isFrench
      ? (this.attr(r.climate, 'friendly_name') || '').replace(/^Thermostat\s*/i, '') || this.roomNameEn(r)
      : this.roomNameEn(r);
    return this.name(given);
  }
  roomNameEn(r) {
    if (r.n) return r.n;
    const fn = this.attr(r.climate, 'friendly_name') || '',
      m = fn.match(/Chambre de (.+)$/i);
    return m ? `${m[1]}'s bedroom` : fn.replace(/^Thermostat\s*/i, '') || r.k;
  }
  rateInfo() {
    const r = this.num(this.E.rate),
      lo = this.num(this.E.rateLow),
      md = this.num(this.E.rateMed),
      rw = this.num(this.E.rateReward);
    const tier =
      r == null
        ? 'Rate unknown'
        : r === rw
          ? 'Challenge rate'
          : r === md
            ? 'Medium tier'
            : r === lo
              ? 'Low tier'
              : 'Current rate';
    return {
      r,
      lo,
      md,
      rw,
      tier,
      short: tier === 'Low tier' ? 'low rate' : tier === 'Medium tier' ? 'medium rate' : tier.toLowerCase(),
    };
  }

  renderHeader() {
    const h = this.fmtEn.hourNow(Date.now()),
      part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = ((this.hass.user && this.hass.user.name) || '')
      .split(' ')[0]
      .replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    // on a phone the Home pane has no title line of its own, so the header carries what it said: the date, inside and outside
    const dateStr = this.fmtEn.dateLong(new Date()),
      L0 = this.compact ? this.live() : null;
    const ins = L0 ? L0.rooms.map(r => r.t).filter(v => v != null) : [],
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
      `${t[0]}<span style="font-size:.45em;margin-left:4px">${t[1] || ''}</span><small>${this.H ? 'Live · history ' + this.fmtEn.time(this.H.at) : 'Live · loading history'}</small>`,
    );
    const temp = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT),
      cond = this.st(this.E.cond),
      att = this.attention();
    const peak = this.st(this.E.hqPeak);
    const chips = [];
    if (temp != null)
      chips.push(
        `<div class="chip wxchip"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="4" fill="var(--m-amber)"/><path d="M8 19h9a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.6A3.2 3.2 0 0 0 8 19z" fill="var(--fg3)" opacity=".7"/></svg><span class="num">${f1(temp)}°</span><small>${esc(condName(ok(cond) ? cond.state : (this.st(this.E.weather) || {}).state))}</small></div>`,
      );
    if (peak && peak.state === 'on')
      chips.push(`<div class="chip"><span class="dot" style="background:var(--crit)"></span>Critical peak now</div>`);
    const open = !this.$('attpop').hidden,
      pill = this.laPill(att);
    if (pill) {
      chips.push(pill);
      if (chips[0].includes('wxchip') && this.liveActs().acts.length)
        chips[0] = chips[0].replace('chip wxchip', 'chip wxchip slim');
    } else if (open) this.toggleAttention(false);
    this.set('chips', chips.join(''));
    const err = this.histErr
      ? `<div class="err">History didn't load: ${esc(this.histErr)}. Live values still update.</div>`
      : '';
    this.set('err', err);
  }

  flowSvg() {
    const L = this.live();
    const kwTxt = v => (v == null ? '–' : v < 1 ? Math.round(v * 1000) + ' W' : v.toFixed(2));
    const unit = v => (v == null || v < 1 ? '' : 'kW');
    const nHeat = L.rooms.filter(r => r.heating).length,
      whT = this.num(this.E.whT),
      wb = this.st(this.E.wbStatus);
    // a live connector's dashes run faster and the line grows thicker with the power on it (motion.css)
    const dash = (on, c, x1, y1, x2, y2, kw) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? c : 'var(--ring)'}" stroke-width="${on ? (3 + Math.min(2, (kw || 0) / 2)).toFixed(1) : 3}" class="${on ? 'dash' : ''}"${on ? ` style="animation-duration:${Math.max(0.45, 2.4 - (kw || 0) * 0.4).toFixed(2)}s"` : ''}/>`;
    const node = (
      cx,
      cy,
      r,
      v,
      color,
      on,
      sub,
    ) => `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--card)" stroke="${on ? color : 'var(--ring)'}" stroke-width="3"/>
      <text x="${cx}" y="${cy + (unit(v) ? -2 : 6)}" text-anchor="middle" class="big" font-size="${r > 41 ? 20 : 18}">${kwTxt(v)}</text>${unit(v) ? `<text x="${cx}" y="${cy + 16}" text-anchor="middle" class="st">kW</text>` : sub ? `<text x="${cx}" y="${cy + 21}" text-anchor="middle" class="st">${sub}</text>` : ''}</g>`;
    return `<svg class="flow" viewBox="0 0 440 340" role="img" aria-label="Grid supplies ${kwTxt(L.grid)} to the home; room heating ${kwTxt(L.heat)}; water heating ${kwTxt(L.wh)}; EV charging ${kwTxt(L.ev)}">
        ${dash(L.grid > 0.02, 'var(--c-grid)', 112, 160, 164, 160, L.grid)}${dash(L.heat > 0.02, 'var(--c-heat)', 276, 160, 328, 160, L.heat)}
        ${dash(L.wh > 0.02, 'var(--c-wh)', 220, 104, 220, 92, L.wh)}${dash(L.ev > 0.02, 'var(--c-ev)', 220, 216, 220, 236, L.ev)}
        ${L.ev > 0.02 ? '<circle cx="220" cy="276" r="40" class="npulse" fill="none" stroke="var(--c-ev)" stroke-width="3"/>' : ''}
        ${node(70, 160, 42, L.grid, 'var(--c-grid)', true)}<text x="70" y="222" text-anchor="middle" class="cap">GRID</text><text x="70" y="238" text-anchor="middle" class="st">${L.grid > 0.02 ? 'Importing' : 'Idle'}</text>
        <g><circle cx="220" cy="160" r="56" fill="var(--card)" stroke="var(--c-home)" stroke-width="4"/><text x="220" y="158" text-anchor="middle" class="big" font-size="28">${L.grid == null ? '–' : L.grid.toFixed(2)}</text><text x="220" y="178" text-anchor="middle" class="st">kW · HOME</text></g>
        ${node(220, 50, 40, L.wh, 'var(--c-wh)', L.wh > 0.02, whT != null ? whT.toFixed(1) + '°' : '')}<text x="300" y="44" class="cap">WATER HEATING</text><text x="300" y="60" class="st">${L.wh > 0.02 ? 'Heating' : 'Idle'}${whT != null && whT >= 48 ? ', hot' : ''}</text>
        ${node(370, 160, 42, L.heat, 'var(--c-heat)', L.heat > 0.02)}<text x="370" y="222" text-anchor="middle" class="cap">ROOM HEATING</text><text x="370" y="238" text-anchor="middle" class="st">${nHeat} of ${this.ROOMS.length} rooms on</text>
        ${node(220, 276, 40, L.ev, 'var(--c-ev)', L.ev > 0.02)}<text x="300" y="272" class="cap">EV CHARGING</text><text x="300" y="288" class="st">${esc(ok(wb) ? wb.state : 'Unavailable')}</text>
        <text x="120" y="290" text-anchor="end" class="st">Rest of home</text><text x="120" y="306" text-anchor="end" class="big" font-size="15">${L.rest == null ? '–' : L.rest.toFixed(2) + ' kW'}</text>
      </svg>`;
  }
  renderEnergy() {
    const ri = this.rateInfo(),
      H = this.H;
    const t = H ? H.totals : null,
      g30 = H ? H.g30 : null;
    this.set(
      'energy',
      `<div class="top"><span class="lbl">Home energy</span><span class="right">Grid only · ${esc(ri.short)}<span class="go">›</span></span></div>
      ${this.flowSvg()}
      <div class="tiles" style="margin-top:6px">${[
        ['Today', t ? f1(t.today) : '–', 'kWh'],
        ['Room heating', g30 ? Math.round(g30[0]) : '–', 'kWh', 'last 30 days'],
        ['Water heating', g30 ? Math.round(g30[1]) : '–', 'kWh', 'last 30 days'],
        ['EV charging', g30 ? Math.round(g30[2]) : '–', 'kWh', 'last 30 days'],
      ]
        .map(tile)
        .join('')}</div>`,
    );
  }
  energySummary() {
    const L = this.live(),
      ri = this.rateInfo();
    return `Grid supplying ${L.grid == null ? '–' : L.grid.toFixed(2)} kW · room heating ${L.heat.toFixed(2)} kW · Hilo ${ri.short}`;
  }

  // ---------- attention ----------
  attention() {
    const items = [],
      clear = [];
    const stale = (id, h) => {
      const s = this.st(id);
      return !ok(s) || Date.now() - Date.parse(s.last_updated) > h * 3600e3;
    };
    if (this.st(this.E.hq)) {
      if (stale(this.E.hq, 36))
        items.push([
          'warn',
          'Hydro-Québec not updating',
          'Billing and peak data are unavailable. Check the Hydro-Québec integration, it may need your password again.',
        ]);
      else clear.push('Hydro-Québec updating');
    }
    const hp = this.st(this.E.hp);
    if (hp) {
      if (!ok(hp))
        items.push(['crit', 'Heat pump offline', `The ${this.hpBrand()} unit shows as unavailable in Home Assistant.`]);
      else clear.push('Heat pump online');
    }
    const gw = this.st(this.E.gateway);
    if (gw) {
      if (gw.state !== 'on' || gw.attributes.disconnected)
        items.push(['crit', 'Hilo gateway offline', 'Thermostats and the meter may stop reporting.']);
      else clear.push('Hilo gateway online');
    }
    const down = this.ROOMS.filter(r => this.st(r.climate) && !ok(this.st(r.climate))).map(r => this.roomName(r));
    if (down.length) items.push(['warn', `${plural(down.length, 'thermostat')} not reporting`, down.join(', ')]);
    const peak = this.st(this.E.hqPeak),
      up = this.st(this.E.hqUpcoming);
    if (peak && peak.state === 'on')
      items.push(['crit', 'Critical peak in progress', 'Hydro-Québec peak period: lower consumption now.']);
    else if (up && up.state === 'on')
      items.push(['warn', 'Critical peak coming', 'Hydro-Québec announced an upcoming critical peak.']);
    else if (ok(peak)) clear.push('No critical peak');
    const w = this.num(this.E.warnings);
    if (w) items.push(['warn', 'Weather warning', `Environment Canada has ${plural(w, 'warning')} for your area.`]);
    else if (w === 0) clear.push('No weather alerts');
    const C = this.car;
    if (C) {
      const tp = this.st(C.id('sensor', 'tirepressure'));
      if (
        ok(tp) &&
        (tp.state !== 'NORMAL_OPERATION' ||
          ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'].some(
            k => tp.attributes[k + '_state'] && tp.attributes[k + '_state'] !== 'NORMAL',
          ))
      )
        items.push(['warn', 'Tire pressure low', 'The car reports a tire below its normal pressure.']);
      const lk = this.st(C.id('lock', 'doorlock'));
      if (ok(lk) && lk.state === 'unlocked') items.push(['warn', 'Car unlocked', 'Lock it from the car view.']);
      else if (ok(lk)) clear.push('Car locked');
      if (!ok(this.st(C.id('sensor', 'soc'))))
        items.push(['warn', 'Car not reporting', 'The Ford integration has no battery data right now.']);
    }
    const X = this.hass ? this.sensors() : [];
    X.filter(
      x =>
        x.kind === 'door' &&
        (this.st(x.id) || {}).state === 'on' &&
        Date.now() - Date.parse(this.st(x.id).last_changed) > 10 * 6e4,
    ).forEach(x =>
      items.push(['warn', `${x.name} open`, `Open for ${this.ago(this.st(x.id).last_changed).replace(' ago', '')}.`]),
    );
    X.filter(x => !ok(this.st(x.id))).forEach(x =>
      items.push(['warn', `${x.name} offline`, 'The sensor is unavailable in Home Assistant.']),
    );
    X.filter(x => this.num(x.bat) != null && this.num(x.bat) < 15).forEach(x =>
      items.push(['warn', `${x.name} battery low`, `${Math.round(this.num(x.bat))}% left.`]),
    );
    if (X.some(x => x.kind === 'door') && !X.some(x => x.kind === 'door' && (this.st(x.id) || {}).state === 'on'))
      clear.push('Doors closed');
    if (this.st(this.E.wbStatus) && !ok(this.st(this.E.wbStatus)))
      items.push(['warn', 'Wallbox offline', 'The charger is unavailable in Home Assistant.']);
    return {items, clear};
  }
  renderAttention() {
    const {items, clear} = this.attention();
    const row = ([lvl, b, s]) =>
      `<div class="arow"><span class="ic acc" style="--acc:var(--${lvl})">!</span><div><b>${esc(b)}</b><span>${esc(s)}</span></div></div>`;
    const acts = this.liveActs().acts;
    this.$('attpop').classList.toggle('la', acts.length > 0);
    this.set(
      'att',
      `${acts.map(a => `<div class="lact" style="--ac:${a.ac}">${a.card()}</div>`).join('')}<div class="lstat"><div class="top"><span class="lbl">Status</span><span class="right">${items.length ? plural(items.length, 'item') + (items.length === 1 ? ' needs' : ' need') + ' attention' : 'All clear'}</span></div>
      ${items.length ? `<div class="att">${items.map(row).join('')}</div>` : `<div class="muted" style="font-size:14px">Everything is reporting normally.</div>`}
      <div class="clear">${clear.map(c => `<span>${esc(c)}</span>`).join('')}</div></div>`,
    );
  }

  // ---------- live activities (2.5.0) ----------
  // While something runs (the car charging, the water heater heating, a Hilo challenge), the status chip turns into a pill
  // with that one number and the time left; other running things sit beside it as small rings, and a status problem as a "!".
  // Tapping opens the Status popup with one card per activity above the usual checks. When the car reaches its limit or a
  // challenge ends, a check shows for 10 minutes, then the chip says "All clear" again.
  liveActs() {
    const now = Date.now(),
      acts = [],
      seen = {};
    const ring = (ic, p, ac, s = 34) => {
      const r = s / 2 - 2.5,
        c = 2 * Math.PI * r,
        pp = p == null ? null : Math.max(0.02, Math.min(1, p));
      return `<span class="lring" style="--ac:${ac};width:${s}px;height:${s}px"><svg viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="color-mix(in srgb,${ac} 16%,transparent)" stroke="color-mix(in srgb,${ac} 22%,transparent)" stroke-width="3"/>${pp == null ? '' : `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${ac}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(c * pp).toFixed(1)} ${c.toFixed(1)}"/>`}</svg><span class="li">${ico(ic, Math.round(s * 0.5))}</span></span>`;
    };
    const head = (a, title, right) =>
      `<div class="lah">${ring(a.ic, a.p, a.ac, 30)}<b>${title}</b><span class="rt">${right}</span></div>`;
    // Hilo challenge: from the start of pre-heat until recovery ends; phase times come from the challenge sensor's next event
    const defi = this.st(this.E.defi),
      dst = ok(defi) ? (defi.state === 'on' ? 'reduction' : defi.state) : null;
    if (['pre_heat', 'reduction', 'recovery'].includes(dst)) {
      const ev = (defi.attributes.next_events || [])[0] || {},
        ph = ev.phases || {};
      const T = k => {
        const v = Date.parse(String(ph[k] || '').replace(' ', 'T'));
        return Number.isFinite(v) ? v : null;
      };
      const [a0, b0] = {
        pre_heat: ['preheat_start', 'preheat_end'],
        reduction: ['reduction_start', 'reduction_end'],
        recovery: ['recovery_start', 'recovery_end'],
      }[dst].map(T);
      const to = dst === 'pre_heat' ? (T('reduction_start') ?? b0) : b0;
      const p = a0 && b0 && b0 > a0 ? (now - a0) / (b0 - a0) : null,
        red = dst === 'reduction';
      const name = {pre_heat: 'Hilo pre-heat', reduction: 'Hilo challenge', recovery: 'Hilo recovery'}[dst],
        short = {pre_heat: 'Pre-heat', reduction: 'Challenge', recovery: 'Recovery'}[dst];
      const left = to ? durTxt(to - now) : '',
        what = dst === 'pre_heat' ? 'challenge in' : 'ends in';
      const L = this.live(),
        ins = L.rooms.map(r => r.t).filter(v => v != null),
        inside = ins.length ? sum(ins) / ins.length : null;
      seen.hilo = true;
      const a = {
        k: 'hilo',
        prio: red ? 0 : 1,
        ic: 'bolt',
        ac: red ? 'var(--crit)' : 'var(--c-grid)',
        p,
        tint: red,
        pill: `<span class="ll">${name}</span>${left ? `<i class="lsep"></i><span class="lv">${what} ${left}</span>` : ''}`,
        short: `<span class="ll">${short}</span>${left ? `<i class="lsep"></i><span class="lv">${left}</span>` : ''}`,
        label: `${name}${left ? `, ${what} ${left}` : ''}`,
      };
      a.card = () => {
        const p0 = T('preheat_start'),
          p1 = T('reduction_start'),
          p2 = T('recovery_start'),
          p3 = T('recovery_end');
        const bar =
          p0 && p1 && p2 && p3 && p3 > p0
            ? (() => {
                const W = p3 - p0,
                  pc = t => (((t - p0) / W) * 100).toFixed(1);
                return `<div class="lph" role="img" aria-label="Pre-heat ${this.fmtEn.time(p0)}, reduction ${this.fmtEn.time(p1)} to ${this.fmtEn.time(p2)}, recovery until ${this.fmtEn.time(p3)}"><span style="flex:${p1 - p0};--pc:var(--c-grid)">Pre-heat</span><span style="flex:${p2 - p1};--pc:var(--crit)">Reduction</span><span style="flex:${p3 - p2};--pc:var(--c-ev)">Recovery</span><i style="left:${Math.max(0, Math.min(100, +pc(now)))}%"></i></div>
            <div class="lpt">${[p0, p1, p2, p3].map(t => `<span style="left:${pc(t)}%">${this.fmtEn.time(t).replace(/ [ap]m$/, '')}</span>`).join('')}</div>`;
              })()
            : '';
        const used = ev.used_kWh,
          allowed = ev.allowed_kWh,
          g = this.kw(this.E.grid);
        const meta = [
          inside != null ? `<b>${inside.toFixed(1)}°</b> inside` : '',
          g != null ? `house using <b>${g.toFixed(1)} kW</b>` : '',
          used != null && allowed ? `<b>${(+used).toFixed(1)}</b> of ${(+allowed).toFixed(1)} kWh allowed` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          head(a, 'Hilo challenge', `${short}${a0 && b0 ? ` · ${this.fmtEn.time(a0)} – ${this.fmtEn.time(b0)}` : ''}`) +
          bar +
          (left
            ? `<div class="lbig"><span class="n">${left}</span><span class="to">${dst === 'pre_heat' ? 'until heating holds back' : dst === 'reduction' ? 'until the challenge ends' : 'until recovery ends'}</span></div>`
            : '') +
          `<div class="lmeta">${dst === 'reduction' ? 'Heating is held back. ' : dst === 'pre_heat' ? 'Rooms are warming up before the challenge. ' : ''}${meta}</div>`
        );
      };
      acts.push(a);
    }
    // the car: while FordPass says it's charging, or while it's plugged in with the Wallbox paused below its limit
    const C = this.car,
      c = C ? this.carState() : null;
    const paused = !!(
      c &&
      !c.charging &&
      c.plugged &&
      this.E.wbPause &&
      this.sw(this.E.wbPause) === false &&
      (c.soc == null || c.lim == null || c.soc < c.lim - 1)
    );
    if (c && (c.charging || paused)) {
      const chg = c.chg ? c.chg.attributes : {},
        soc = c.soc,
        lim = c.lim || 100;
      const pw =
        this.kw(this.E.evP) ??
        (() => {
          const k = Object.keys(chg).find(x => /charg.*(power|kw)$/i.test(x));
          return k && Number.isFinite(+chg[k]) ? +chg[k] : null;
        })();
      // time to full: FordPass's own estimate when it reports one, else what's left of the battery at the charger's power
      let eta = null;
      for (const [k, v] of Object.entries(chg)) {
        if (!/(end|complete|full|remain)/i.test(k)) continue;
        const t = typeof v === 'string' && /\d{4}-\d\d-\d\d/.test(v) ? Date.parse(v) : null;
        if (t && t > now) {
          eta = t;
          break;
        }
        if (/(minutes|remain|to.?full)/i.test(k) && Number.isFinite(+v) && +v > 0 && +v < 3000) {
          eta = now + +v * 6e4;
          break;
        }
      }
      const cap = +this.CFG.car.battery_kwh;
      if (!eta && c.charging && cap && soc != null && pw > 0.3 && soc < lim)
        eta = now + ((((lim - soc) / 100) * cap) / pw) * 36e5;
      const left = eta ? durTxt(eta - now) : '';
      const H = this.H,
        ses = H && H.sessions.length ? H.sessions[H.sessions.length - 1] : null,
        plugT = (() => {
          const x = this.st(C.id('sensor', 'elvehplug'));
          return ok(x) ? Date.parse(x.last_changed) : null;
        })();
      // the hourly charging session that started with this plug-in (sessions are built from hourly statistics)
      const cur = ses && ses.b >= now - 2 * 36e5 && (!plugT || ses.a >= plugT - 36e5) ? ses : null;
      const price = this.num(this.E.wbPrice) ?? 0.07,
        plug = this.st(C.id('sensor', 'elvehplug'));
      seen.car = {lim};
      const a = {
        k: 'car',
        prio: 2,
        ic: 'car',
        ac: paused ? 'var(--fg3)' : 'var(--c-ev)',
        p: soc == null ? null : soc / 100,
        pill: `<span class="ll">${paused ? 'Charging paused' : 'Charging'}</span><span class="lv">${f0(soc)}%</span>${left ? `<i class="lsep"></i><span class="lv">${left}</span>` : ''}`,
        short: `<span class="lv">${f0(soc)}%</span><i class="lsep"></i><span class="lv">${paused ? 'paused' : left || 'charging'}</span>`,
        label: `${paused ? 'Charging paused' : 'Car charging'}, ${f0(soc)} percent${left ? `, full in ${left}` : ''}`,
      };
      a.card = () => {
        const on = this.sw(this.E.wbPause);
        const meta = [
          ok(plug) && plug.state !== 'DISCONNECTED'
            ? `Plugged in at ${this.fmtEn.time(new Date(plug.last_changed))}`
            : '',
          cur ? `<b>+${f1(cur.kwh)} kWh</b> so far · about <b>$${(cur.kwh * price).toFixed(2)}</b>` : '',
          c.range != null ? `${Math.round(c.range)} km range` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          head(
            a,
            `${esc(this.carName())} <span>${paused ? 'paused' : 'charging'}</span>`,
            pw != null && pw > 0.05 ? `${pw.toFixed(1)} kW` : '',
          ) +
          `<div class="lbig"><span class="n">${f0(soc)}<small>%</small></span><span class="to">→ ${lim}% limit</span>${eta ? `<span class="eta"><b>Full at ${this.fmtEn.time(eta)}</b>in ${left}</span>` : ''}</div>
          <div class="lbar" role="img" aria-label="Battery ${f0(soc)} percent, limit ${lim} percent"><i style="width:${soc || 0}%"></i><em style="left:${lim}%"></em></div>
          ${meta ? `<div class="lmeta">${meta}</div>` : ''}
          <div class="lbtns">${this.E.wbPause && ok(this.st(this.E.wbPause)) ? `<button type="button" data-la="pause">${on === false ? 'Resume charging' : 'Pause charging'}</button>` : ''}<button type="button" class="go" data-la="car">Open Car ›</button></div>`
        );
      };
      acts.push(a);
    }
    // the water heater: while it draws power; time left from how long its other cycles today lasted
    const wp = this.kw(this.E.whP);
    if (wp != null && wp > 0.2) {
      const W = this.H && this.H.wh24,
        pts = W ? W.p.filter(x => x[0] >= now - 864e5) : [],
        runs = [];
      let r0 = null;
      pts.forEach((x, i) => {
        const on = x[1] > 0.2;
        if (on && r0 == null) r0 = x[0];
        if ((!on || i === pts.length - 1) && r0 != null) {
          runs.push([r0, on ? x[0] + 3e5 : x[0]]);
          r0 = null;
        }
      });
      const last = runs[runs.length - 1],
        open = last && last[1] >= now - 15 * 6e4;
      const sPw = this.st(this.E.whP),
        start = open ? last[0] : Date.parse(sPw.last_changed);
      const done = runs
        .filter(x => x !== (open ? last : null) && x[1] - x[0] >= 5 * 6e4)
        .map(x => x[1] - x[0])
        .sort((x, y) => x - y);
      const typ = done.length ? done[Math.floor(done.length / 2)] : null,
        el = now - start;
      const left = typ ? Math.max(0, typ - el) : null,
        t = this.num(this.E.whT);
      const tp = W ? W.t.filter(x => x[0] >= start - 6e5) : [];
      const rate =
        tp.length > 1 && tp[tp.length - 1][0] > tp[0][0]
          ? (tp[tp.length - 1][1] - tp[0][1]) / ((tp[tp.length - 1][0] - tp[0][0]) / 6e5)
          : null;
      const lt = left == null ? '' : left < 3 * 6e4 ? 'almost done' : `~${durTxt(left)}`;
      const a = {
        k: 'wh',
        prio: 3,
        ic: 'drop',
        ac: 'var(--c-wh)',
        p: typ ? el / typ : null,
        pill: `<span class="ll">Water heater</span>${t != null ? `<span class="lv">${Math.round(t)}°</span>` : ''}${lt ? `<i class="lsep"></i><span class="lv">${lt}</span>` : ''}`,
        short: `<span class="ll">Water</span>${lt ? `<i class="lsep"></i><span class="lv">${lt}</span>` : ''}`,
        label: `Water heater heating${lt ? `, ${lt.replace('~', 'about ')} left` : ''}`,
      };
      a.card = () => {
        const kwh = sum(pts.filter(x => x[0] >= start).map(x => x[1])) / 12,
          nth = runs.length;
        let spark = '';
        if (tp.length > 1) {
          const ys = tp.map(x => x[1]),
            lo = Math.min(...ys) - 0.5,
            hi = Math.max(...ys) + 0.5,
            x0 = tp[0][0],
            x1 = Math.max(now, x0 + 1);
          const X = v => (((v - x0) / (x1 - x0)) * 330 + 5).toFixed(1),
            Y = v => (40 - ((v - lo) / (hi - lo)) * 34).toFixed(1);
          const d = tp.map((x, i) => `${i ? 'L' : 'M'}${X(x[0])},${Y(x[1])}`).join(''),
            e = tp[tp.length - 1];
          spark = `<svg class="lspark" viewBox="0 0 340 46" preserveAspectRatio="none" role="img" aria-label="Water temperature this cycle"><path d="${d}L${X(e[0])},46L5,46Z" fill="color-mix(in srgb,var(--c-wh) 16%,transparent)"/><path d="${d}" fill="none" stroke="var(--c-wh)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
        }
        return (
          head(a, 'Water heater heating', `${wp.toFixed(1)} kW`) +
          spark +
          `<div class="lbig"><span class="n">${f1(t)}<small>°C</small></span>${rate != null && Math.abs(rate) >= 0.05 ? `<span class="to">${rate > 0 ? '↗' : '↘'} ${Math.abs(rate).toFixed(1)}° / 10 min</span>` : ''}${lt ? `<span class="eta"><b>${lt === 'almost done' ? 'Almost done' : lt + ' left'}</b>usual cycle ${durTxt(typ)}</span>` : ''}</div>
          <div class="lmeta">Started ${this.fmtEn.time(start)}${pts.length ? ` · <b>${kwh.toFixed(1)} kWh</b> this cycle` : ''}${nth > 1 ? ` · ${plural(nth, 'cycle')} in 24 h` : ''}</div>`
        );
      };
      acts.push(a);
    }
    acts.sort((x, y) => x.prio - y.prio);
    // something that just finished keeps a check for 10 minutes: the car at its limit, a challenge after recovery
    /** @type {Record<string, any>} */
    const prev = this.laSeen || {};
    if (prev.car && !seen.car && c && c.soc != null && c.soc >= (prev.car.lim || 100) - 1)
      this.laDone = {text: `Charged to ${Math.round(c.soc)}%`, until: now + 6e5, at: now};
    if (prev.hilo && !seen.hilo && ok(defi) && !['pre_heat', 'reduction', 'recovery', 'on'].includes(defi.state))
      this.laDone = {text: 'Challenge done', until: now + 6e5, at: now};
    this.laSeen = seen;
    if (this.laDone && (this.laDone.until < now || acts.length)) this.laDone = null;
    return {acts, done: this.laDone};
  }
  laPill(att) {
    const {acts, done} = this.liveActs();
    // since 2.8.0 there is no "All clear" chip: with nothing running and nothing to check, the spot stays empty
    if (!acts.length && !done && !att.items.length) return null;
    const open = !this.$('attpop').hidden,
      crit = att.items.some(i => i[0] === 'crit'),
      a = acts[0];
    const need = att.items.length === 1 ? '1 thing needs attention' : `${att.items.length} things need attention`;
    // only a status problem: the pill is the problem, in amber (red when critical)
    if (!a && !done)
      return `<button type="button" class="chip attchip lap" aria-haspopup="dialog" aria-expanded="${open}"><span class="lmain latt" style="--ac:var(--${crit ? 'crit' : 'warn'})"><span class="lwarn"><b>!</b></span><span>${need}</span></span></button>`;
    const ring = (x, s) => {
      const r = s / 2 - 2.5,
        c = 2 * Math.PI * r,
        p = x.p == null ? null : Math.max(0.02, Math.min(1, x.p));
      return `<span class="lring" style="--ac:${x.ac};width:${s}px;height:${s}px"><svg viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="color-mix(in srgb,${x.ac} 16%,transparent)" stroke="color-mix(in srgb,${x.ac} 22%,transparent)" stroke-width="3"/>${p == null ? '' : `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${x.ac}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"/>`}</svg><span class="li">${ico(x.ic, Math.round(s * 0.5))}</span></span>`;
    };
    const main = a
      ? `<span class="lmain${a.tint ? ' tint' : ''}" style="--ac:${a.ac}">${ring(a, 34)}<span class="sr">${esc(a.label)}</span><span class="lsay" aria-hidden="true">${this.compact ? a.pill : a.short}</span></span>`
      : `<span class="lmain" style="--ac:var(--c-ev)"><span class="lok">${ico('check', 18)}</span><span>${esc(done.text)}</span>${this.compact ? '' : `<span class="ll">${this.fmtEn.time(done.at)}</span>`}</span>`;
    const bubs =
      acts
        .slice(1)
        .map(x => `<span class="lbub">${ring(x, 36)}<span class="sr">${esc(x.label)}</span></span>`)
        .join('') +
      (att.items.length
        ? `<span class="lbub lwarn" style="--ac:var(--${crit ? 'crit' : 'warn'})"><b aria-hidden="true">!</b><span class="sr">${need}</span></span>`
        : '');
    return `<button type="button" class="chip attchip lap" aria-haspopup="dialog" aria-expanded="${open}">${main}${bubs}</button>`;
  }
  laClick(e) {
    const b = e.target.closest('[data-la]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.la === 'car') {
      this.toggleAttention(false);
      this.renderHeader();
      this.sheets.open('sh-car');
      return;
    }
    if (b.dataset.la === 'pause' && this.E.wbPause) {
      const on = !this.sw(this.E.wbPause);
      this.pending[this.E.wbPause] = {on, until: Date.now() + 20000};
      this.call(
        'switch',
        on ? 'turn_on' : 'turn_off',
        {entity_id: this.E.wbPause},
        on ? 'Charging resumed' : 'Charging paused',
      );
      this.renderAttention();
      this.renderHeader();
    }
  }

  // ---------- climate card ----------
  renderClimate() {
    const L = this.live(),
      H = this.H,
      temps = L.rooms.map(r => r.t).filter(v => v != null);
    const avg = temps.length ? sum(temps) / temps.length : null,
      n = L.rooms.filter(r => r.heating).length;
    const right = `${L.hpOn ? 'Heat pump + ' : ''}${plural(n, 'room')} heating`;
    const rooms = L.rooms
      .map(r => {
        const s = r.heating
          ? `Heating · ${r.p.toFixed(1)} kW`
          : !r.ok
            ? 'Unavailable'
            : r.sp > 5.5
              ? `Set ${r.sp}°`
              : 'Off · 5°';
        return `<div class="room ${r.heating ? 'on' : ''}"><div class="n">${esc(r.name)}</div><div class="row"><span class="t num">${f1(r.t)}°</span><span class="s">${s}</span></div>${H ? this.spark(H.temp24[r.k] || [], r.heating ? this.css('--c-wh') : this.css('--c-home'), r.name + ', last 24 hours') : '<svg></svg>'}</div>`;
      })
      .join('');
    this.set(
      'climate',
      `<div class="top"><span class="lbl">Climate <span class="num" style="font-weight:500;color:var(--fg2);margin-left:6px">${avg == null ? '' : avg.toFixed(1) + '° inside'}</span></span><span class="right">${right}<span class="go">›</span></span></div><div class="rooms">${rooms}</div>`,
    );
  }
  spark(pts, color, label) {
    pts = pts.filter(p => p[1] != null);
    if (pts.length < 2) return '<svg></svg>';
    const w = 300,
      h = 28,
      ys = pts.map(p => p[1]),
      lo = Math.min(...ys),
      hi = Math.max(...ys),
      sp = hi - lo || 1;
    const d = pts
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 3 - ((p[1] - lo) / sp) * (h - 6)).toFixed(1)}`,
      )
      .join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}, ${lo.toFixed(1)} to ${hi.toFixed(1)} degrees"><path d="${d} L${w},${h} L0,${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }
  bars(vals, labels, color, unit) {
    const w = 300,
      h = 56,
      n = vals.length || 1,
      gap = 2,
      bw = (w - gap * (n - 1)) / n,
      hi = Math.max(...vals, 0) || 1;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Daily ${unit} bars, highest ${hi.toFixed(1)} ${unit}">${vals
      .map((v, i) => {
        const bh = Math.max(v > 0 ? 2 : 1, (v / hi) * (h - 4));
        return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${v > 0 ? color : this.css('--ring')}"><title>${labels[i]}: ${v.toFixed(1)} ${unit}</title></rect>`;
      })
      .join('')}</svg>`;
  }

  // ---------- car discovery ----------
  findCar() {
    if (this.car) return;
    const id = Object.keys(this.hass.states).find(e => /^sensor\.fordpass_[a-z0-9]+_soc$/.test(e));
    if (!id) return;
    const pre = id.slice('sensor.'.length, -'_soc'.length);
    this.car = {pre, id: (dom, key) => `${dom}.${pre}_${key}`};
  }
  carName() {
    const img = this.car.id('image', 'vehicleimage'),
      fn = this.name(img, '');
    return this.CFG.car.name || fn.replace(/\s*Vehicle Picture$/i, '') || 'Car';
  }
  carImg() {
    const pic = this.attr(this.car.id('image', 'vehicleimage'), 'entity_picture');
    return pic && !this.imgFail
      ? `<img class="carimg" src="${esc(pic)}" alt="${esc(this.carName())}">`
      : this.CFG.car.color
        ? CARSVG.replace('<svg class="carside"', `<svg class="carside" style="--car-body:${esc(this.CFG.car.color)}"`)
        : CARSVG;
  }
  carState() {
    const C = this.car,
      A = (k, a) => this.attr(C.id('sensor', k), a),
      S = k => this.st(C.id('sensor', k));
    const soc = this.num(C.id('sensor', 'soc')),
      range = A('soc', 'batteryRange') ?? this.num(C.id('sensor', 'elveh'));
    const chg = S('elvehcharging'),
      plug = this.st(C.id('sensor', 'elvehplug'));
    const lim = chg ? chg.attributes.globalAcTargetSoc : null;
    const lock = this.st(C.id('lock', 'doorlock')),
      trk = this.st(C.id('device_tracker', 'tracker'));
    const plugged = ok(plug) && plug.state !== 'DISCONNECTED';
    const charging = ok(chg) && /CHARGING/.test(chg.state) && !/NOT/.test(chg.state);
    return {
      soc,
      range,
      lim,
      chg,
      plugged,
      charging,
      locked: ok(lock) ? lock.state === 'locked' : null,
      home: ok(trk) ? trk.state === 'home' : null,
      where: ok(trk) ? (trk.state === 'home' ? 'Parked at home' : trk.state === 'not_home' ? 'Away' : trk.state) : '',
    };
  }
  // the sections this house has nothing for (true = nothing): Climate with no thermostat and no heat pump, Car with no car, the water
  // heater with neither of its sensors, Hilo with no rate. availability() and gateLacking hide them; renderWater and renderHilo draw nothing for them
  lacking() {
    return {
      climate: !this.ROOMS.length && !this.st(this.E.hp),
      car: !this.car,
      water: !(this.st(this.E.whT) || this.st(this.E.whP)),
      hilo: !this.st(this.E.rate),
    };
  }
  renderCarCard() {
    if (!this.car) {
      this.set(
        'carcard',
        `<div class="top"><span class="lbl">Car</span></div><div class="muted">No FordPass car found.</div>`,
      );
      return;
    }
    const c = this.carState(),
      H = this.H,
      wb = this.st(this.E.wbStatus),
      odo = this.num(this.car.id('sensor', 'odometer'));
    const last = H && H.sessions.length ? H.sessions[H.sessions.length - 1] : null;
    const ev30 = H ? H.daily.slice(-30) : [];
    this.set(
      'carcard',
      `<div class="top"><span class="lbl">${esc(this.carName())}</span><span class="right">${esc(c.where)}<span class="go">›</span></span></div>
      <div class="hero"><div><div class="v num">${f1(c.soc)}<small>%</small></div><div class="muted" style="margin-top:6px;font-size:13px">${c.range != null ? Math.round(c.range) + ' km range' : ''}${c.locked != null ? ` · ${c.locked ? 'locked' : 'unlocked'}` : ''} · ${c.charging ? 'charging' : c.plugged ? 'plugged in' : 'unplugged'}</div></div>${this.carImg()}</div>
      <div class="socbar" role="img" aria-label="Battery ${f1(c.soc)} percent${c.lim ? ', charge limit ' + c.lim + ' percent' : ''}"><i style="width:${c.soc || 0}%"></i>${c.lim ? `<b style="left:${c.lim}%"></b>` : ''}</div>
      <div class="socscale"><span>0%</span><span>${c.lim ? 'Limit ' + c.lim + '%' : ''}</span></div>
      <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px">${[
        ['Charger', `<span class="wrapv">${esc(ok(wb) ? wb.state : '–')}</span>`, '', 'Wallbox'],
        ['Last charge', last ? f1(last.kwh) : '–', 'kWh', last ? this.fmtEn.date(last.a) : ''],
        ['Odometer', odo == null ? '–' : this.fmtEn.integer(odo), 'km'],
      ]
        .map(tile)
        .join('')}</div>
      ${
        H
          ? this.bars(
              ev30.map(r => r.ev),
              ev30.map(r => this.fmtUtcEn.date(dayAt(r.day))),
              this.css('--c-ev'),
              'kWh',
            )
          : ''
      }
      ${H ? `<div class="muted" style="font-size:12px">Daily EV energy, last 30 days: ${ev30.filter(r => r.ev > 5).length} charging days, ${Math.round(H.g30[2])} kWh.</div>` : ''}`,
    );
  }
  // the water heater's own name: its sensor's name without the measurement ("Tank Temperature" → "Tank")
  whName() {
    const id = [this.E.whT, this.E.whP].find(i => this.attr(i, 'friendly_name')),
      fn = id ? this.name(id) : '';
    return fn.replace(/\s*(water heater\s*)?(temperature|température|power|puissance)$/i, '').trim();
  }
  renderWater() {
    if (this.lacking().water) return;
    const t = this.num(this.E.whT),
      p = this.kw(this.E.whP),
      H = this.H,
      d = H ? H.wh14 : [],
      W = H && H.wh24;
    const pp = W ? W.p.filter(x => x[0] >= Date.now() - 864e5) : [],
      e24 = sum(pp.map(x => x[1])) / 12;
    let cyc = 0;
    pp.forEach((x, i) => {
      if (x[1] > 0.2 && !(i && pp[i - 1][1] > 0.2 && x[0] - pp[i - 1][0] <= 3e5)) cyc++;
    });
    const avg = sum(d.map(r => r[1])) / (d.length || 1);
    this.set(
      'water',
      `<div class="top"><span class="lbl">Water heater</span><span class="right">${esc(this.whName())}</span></div>
      <div class="hero"><div class="v num">${f1(t)}<small>°C</small></div><span class="state"><i style="background:${p > 0.02 ? 'var(--c-wh)' : 'var(--fg3)'}"></i>${p > 0.02 ? 'Heating · ' + p.toFixed(1) + ' kW' : 'Idle · 0 W'}</span></div>
      ${
        W
          ? this.whChart(W) +
            `<div class="whleg" style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--fg2);margin-top:6px"><span style="display:inline-flex;align-items:center;gap:6px"><i style="width:14px;height:3px;border-radius:2px;background:var(--c-wh)"></i>Water temperature</span><span style="display:inline-flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:2px;background:color-mix(in srgb,var(--c-wh) 42%,transparent)"></i>Heating power</span></div>
      <div class="muted" style="font-size:12px;margin-top:4px">${`Last 24 hours: ${e24.toFixed(1)} kWh over ${cyc} heating ${cyc === 1 ? 'cycle' : 'cycles'}.`}${d.length ? ` ${d.length}-day average: ${avg.toFixed(1)} kWh a day.` : ''}</div>`
          : ''
      }`,
    );
  }
  whChart(W) {
    const w = 320,
      h = 120,
      L = 28,
      R = 34,
      T = 8,
      B = 18,
      pw = w - L - R,
      ph = h - T - B,
      now = Date.now(),
      t0 = now - 864e5;
    const X = t => L + Math.max(0, Math.min(1, (t - t0) / 864e5)) * pw;
    const tp = W.t.filter(x => x[0] >= t0 - 3e5),
      pp = W.p.filter(x => x[0] >= t0);
    if (tp.length < 2 && !pp.length) return '';
    const ys = tp.map(x => x[1]);
    let lo = ys.length ? Math.floor(Math.min(...ys) - 0.5) : 45,
      hi = ys.length ? Math.ceil(Math.max(...ys) + 0.5) : 55;
    if (hi - lo < 4) {
      lo = Math.floor((hi + lo) / 2 - 2);
      hi = lo + 4;
    }
    const Yt = v => T + ((hi - v) / (hi - lo)) * ph;
    const pmax = Math.max(5, Math.ceil(Math.max(0, ...pp.map(x => x[1])))),
      Yp = v => T + ph - (v / pmax) * ph,
      bw = Math.max(1.4, pw / 288);
    const txt = (x, y, s, a = 'start') =>
      `<text x="${x}" y="${y}" text-anchor="${a}" font-size="9" fill="var(--fg3)" style="font-family:var(--f-body)">${s}</text>`;
    const grid = [lo, (lo + hi) / 2, hi]
      .map(
        v =>
          `<line x1="${L}" x2="${w - R}" y1="${Yt(v).toFixed(1)}" y2="${Yt(v).toFixed(1)}" stroke="var(--ring)" stroke-width="1"/>` +
          txt(L - 4, Yt(v) + 3, `${+v.toFixed(1)}°`, 'end'),
      )
      .join('');
    const pax = txt(w - R + 4, T + 3, `${pmax} kW`) + txt(w - R + 4, T + ph + 3, '0 kW');
    let ticks = '';
    for (let t = Math.ceil(t0 / 36e5) * 36e5; t <= now; t += 36e5) {
      if (this.fmtEn.dayParts(t).h % 6 === 0)
        ticks +=
          `<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${T + ph}" y2="${T + ph + 3}" stroke="var(--ring)"/>` +
          txt(X(t), h - 4, this.fmtEn.hour(t), 'middle');
    }
    const bars = pp
      .filter(x => x[1] > 0.05)
      .map(
        x =>
          `<rect x="${X(x[0]).toFixed(1)}" y="${Yp(x[1]).toFixed(1)}" width="${bw.toFixed(1)}" height="${(T + ph - Yp(x[1])).toFixed(1)}" rx=".6" fill="var(--c-wh)" opacity=".42"><title>${this.fmtEn.time(x[0])}: ${x[1].toFixed(1)} kW</title></rect>`,
      )
      .join('');
    const line = tp.map((x, i) => `${i ? 'L' : 'M'}${X(x[0] + 15e4).toFixed(1)},${Yt(x[1]).toFixed(1)}`).join('');
    const last = tp[tp.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:auto;margin-top:12px;overflow:visible" role="img" aria-label="Water temperature ${lo} to ${hi} degrees and heating power, last 24 hours">${grid}${pax}${ticks}${bars}${tp.length > 1 ? `<path d="${line}" fill="none" stroke="var(--c-wh)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${last ? `<circle cx="${X(last[0] + 15e4).toFixed(1)}" cy="${Yt(last[1]).toFixed(1)}" r="3" fill="var(--c-wh)" stroke="var(--card)" stroke-width="1.5"/>` : ''}</svg>`;
  }
  renderHilo() {
    if (this.lacking().hilo) return;
    const ri = this.rateInfo(),
      defi = this.st(this.E.defi),
      rw = this.num(this.E.rewards);
    const ch = !ok(defi)
      ? 'Challenge status unknown'
      : defi.state === 'off'
        ? 'No challenge scheduled'
        : `Challenge: ${defi.state}`;
    this.set(
      'hilo',
      `<div class="top"><span class="lbl">Hilo</span><span class="right">${esc(ch)}</span></div>
      <div class="hero"><div class="v num">${ri.r == null ? '–' : (ri.r * 100).toFixed(2)}<small>¢/kWh</small></div><span class="state"><i style="background:${ri.tier === 'Low tier' ? 'var(--ok)' : 'var(--warn)'}"></i>${esc(ri.tier)}</span></div>
      <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:14px">${[
        ['Medium', ri.md == null ? '–' : (ri.md * 100).toFixed(2), '¢'],
        ['Reward', ri.rw == null ? '–' : (ri.rw * 100).toFixed(2), '¢'],
        ['Rewards', rw == null ? '–' : rw.toFixed(0), '$'],
      ]
        .map(tile)
        .join('')}</div>`,
    );
  }

  // ---------- history ----------
  async loadHistory() {
    // one load per config at a time; a load under another config (the panel was redrawn meanwhile) is let go
    const generation = this.store.generation;
    // loadingGen is an in-flight marker (the generation whose load is running), not a stale guard: the StaleReply
    // caught below is the guard
    if (!this.hass || generation === this.loadingGen) return;
    this.loadingGen = generation;
    try {
      const now = new Date(),
        d = n => new Date(now.getTime() - n * 864e5);
      const powers = [this.E.grid, this.E.whP, this.E.evP, ...this.ROOMS.map(r => r.power)],
        temps = [...this.ROOMS.map(r => r.temp), this.E.outT];
      // the spans asked here and in CRANGE are copied into STATISTIC_SPANS of scripts/record-fixture.mjs, which a test checks
      const [hour7, day, meter, evh, hp] = await Promise.all([
        this.api.statistics([...powers, ...temps], 'hour', d(7), ['mean', 'max']),
        this.api.statistics([...powers, ...temps], 'day', d(400), ['mean', 'min', 'max']),
        this.api.statistics([this.E.energy, this.E.whE], 'day', d(33), ['change']),
        this.api.statistics([this.E.evP], 'hour', d(366), ['mean', 'max']),
        !this.E.hp
          ? Promise.resolve({})
          : this.api.history([this.E.hp], d(7), {minimal: false, attributes: true}).catch(noHistory),
      ]);
      const [today, t24] = await Promise.all([
        this.api.statistics(
          [this.E.energy],
          'hour',
          new Date(Date.now() - this.fmtEn.hourNow(Date.now()) * 36e5 - 60e3),
          ['change'],
        ),
        this.api.statistics([...this.ROOMS.map(r => r.temp), this.E.whT, this.E.whP], '5minute', d(1.05), ['mean']),
      ]);
      const first = !this.H;
      this.H = this.derive(hour7, day, meter, evh, hp, today, t24);
      if (first) this.ctx.shell.requestFrame(); // the settings popup's version line says the history is kept fresh
      this.histErr = null;
    } catch (e) {
      // a load of an old config is let go whatever went wrong: a network error is no StaleReply, but the new load owns the state
      if (e instanceof StaleReply || generation !== this.store.generation) return;
      console.error('home-panel history', e);
      this.histErr = e.message || e.code || String(e);
    }
    this.loadingGen = false;
    this.cache = {};
    this.renderLive();
    if (this.sheets.shown) this.redrawCharts();
  }
  derive(hour7, day, meter, evh, hp, today, t24) {
    const ser = (r, id) => (r[id] || []).map(x => ({...x, t: ms(x.start)}));
    const byT = (r, id, f = 'mean') => new Map(ser(r, id).map(x => [x.t, x[f]]));
    // hourly flow, last 7 days: [t, ev, wh, heat, rest, total] in kWh per hour
    const hw = byT(hour7, this.E.whP),
      he = byT(hour7, this.E.evP),
      hr = this.ROOMS.map(r => byT(hour7, r.power));
    const flow = ser(hour7, this.E.grid)
      .filter(x => x.mean != null)
      .map(x => {
        const w = hw.get(x.t) || 0,
          e = he.get(x.t) || 0,
          h = sum(hr.map(m => m.get(x.t) || 0));
        return [
          x.t,
          +e.toFixed(3),
          +w.toFixed(3),
          +h.toFixed(3),
          +Math.max(0, x.mean - w - e - h).toFixed(3),
          +x.mean.toFixed(3),
        ];
      });
    const temp7 = {};
    this.ROOMS.forEach(r => {
      temp7[r.k] = ser(hour7, r.temp)
        .filter(x => x.mean != null)
        .map(x => [x.t, +x.mean.toFixed(2)]);
    });
    // room temperatures, last 24 hours in 5-minute means
    const wh24 = {
      t: ser(t24, this.E.whT)
        .filter(x => x.mean != null)
        .map(x => [x.t, x.mean]),
      p: ser(t24, this.E.whP)
        .filter(x => x.mean != null)
        .map(x => [x.t, x.mean]),
    };
    const temp24 = {};
    this.ROOMS.forEach(r => {
      temp24[r.k] = ser(t24, r.temp)
        .filter(x => x.mean != null)
        .map(x => [x.t, +x.mean.toFixed(2)]);
    });
    const out7 = ser(hour7, this.E.outT)
      .filter(x => x.mean != null)
      .map(x => [x.t, +x.mean.toFixed(2)]);
    // daily kWh = mean kW x hours; today only counts the hours so far
    const todayKey = this.fmtEn.isoDay(Date.now()),
      hrsToday = Math.max(1, Math.floor(this.fmtEn.hourNow(Date.now())));
    const dw = byT(day, this.E.whP),
      de = byT(day, this.E.evP),
      dr = this.ROOMS.map(r => byT(day, r.power));
    const daily = ser(day, this.E.grid)
      .filter(x => x.mean != null)
      .map(x => {
        const key = this.fmtEn.isoDay(x.t + 12 * 36e5),
          hrs = key === todayKey ? hrsToday : 24;
        const w = (dw.get(x.t) || 0) * hrs,
          e = (de.get(x.t) || 0) * hrs,
          h = sum(dr.map(m => m.get(x.t) || 0)) * hrs,
          g = x.mean * hrs;
        return {
          day: key,
          heat: h,
          wh: w,
          ev: e,
          rest: Math.max(0, g - w - e - h),
          total: g,
          rooms: dr.map(m => (m.get(x.t) || 0) * hrs),
        };
      });
    const last30 = daily.slice(-30),
      g30 = ['heat', 'wh', 'ev', 'rest'].map(k => sum(last30.map(r => r[k])));
    const room30 = this.ROOMS.map((r, i) => sum(last30.map(d => d.rooms[i])));
    const months = {};
    daily.forEach(r => {
      const k = r.day.slice(0, 7);
      const m = (months[k] = months[k] || {heat: 0, wh: 0, ev: 0, rest: 0});
      ['heat', 'wh', 'ev', 'rest'].forEach(f => {
        m[f] += r[f];
      });
    });
    const monthly = Object.entries(months).sort().slice(-12);
    const heatmap = this.ROOMS.map(r => ({
      k: r.k,
      pts: ser(day, r.temp)
        .filter(x => x.mean != null)
        .slice(-30)
        .map(x => [this.fmtEn.isoDay(x.t + 12 * 36e5), +x.mean.toFixed(1)]),
    }));
    const out90 = ser(day, this.E.outT)
      .filter(x => x.mean != null)
      .slice(-90)
      .map(x => [x.t + 12 * 36e5, +x.mean.toFixed(1), +x.min.toFixed(1), +x.max.toFixed(1)]);
    // meter totals
    const md = ser(meter, this.E.energy).map(x => [this.fmtEn.isoDay(x.t + 12 * 36e5), x.change || 0]);
    const wh14 = ser(meter, this.E.whE)
      .map(x => [this.fmtEn.isoDay(x.t + 12 * 36e5), x.change || 0])
      .filter(r => r[0] !== todayKey)
      .slice(-14);
    const yKey = this.fmtEn.isoDay(Date.now() - 864e5),
      mKey = todayKey.slice(0, 7);
    const totals = {
      today: sum(ser(today, this.E.energy).map(x => x.change)),
      yesterday: (md.find(r => r[0] === yKey) || [0, null])[1],
      d30: sum(md.slice(-30).map(r => r[1])),
      month: sum(md.filter(r => r[0].startsWith(mKey)).map(r => r[1])),
    };
    // charging sessions: runs of hours with the Wallbox above 0.3 kW, joined across gaps up to 3 hours
    const sessions = [];
    let cur = null;
    ser(evh, this.E.evP).forEach(x => {
      if ((x.mean || 0) <= 0.3) return;
      if (cur && x.t - cur.end <= 3 * 36e5) {
        cur.end = x.t;
        cur.kwh += x.mean;
        cur.pk = Math.max(cur.pk, x.max || 0);
      } else {
        cur = {a: x.t, end: x.t, kwh: x.mean, pk: x.max || 0};
        sessions.push(cur);
      }
    });
    sessions.forEach(s => {
      s.b = s.end + 36e5;
    });
    // heat pump readings from state history; a gap over 6 hours means it was offline
    const hpPts = [];
    let prev = null;
    ((hp && hp[this.E.hp]) || []).forEach(x => {
      const t = x.lastUpdated,
        a = x.attributes || {},
        v = x.state === 'unavailable' ? null : a.current_temperature;
      if (x.attributes) this.hpLastAttrs = a;
      if (v == null) {
        if (hpPts.length) hpPts.push([t, null]);
        prev = null;
        return;
      }
      if (prev != null) hpPts.push([t - 1, prev]);
      hpPts.push([t, v]);
      prev = v;
    });
    return {
      at: new Date(),
      flow,
      temp7,
      temp24,
      wh24,
      out7,
      daily,
      g30,
      room30,
      monthly,
      heatmap,
      out90,
      totals,
      wh14,
      sessions: sessions.filter(s => s.kwh >= 1),
      hpPts,
    };
  }

  // ---------- sheets ----------
  // the sheet host calls these two: a legacy sheet is on screen (over the page, or inline in its pane) or left it
  sheetOpened(id) {
    if (id === 'sh-car') this.depDraft = null;
    this.buildSheet(id);
  }
  sheetClosed(id) {
    this.destroyCharts();
    if (id === 'sh-cam') {
      this.$('camlive').innerHTML = '';
      this.camEl = null;
    }
    if (id === 'sh-card' && this.cardBack) {
      const {el, parent, next} = this.cardBack;
      this.cardBack = null;
      parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    }
  }
  destroyCharts() {
    this.charts.forEach(c => {
      try {
        c.destroy();
      } catch {}
    });
    this.charts = [];
    this.mainChart = this.climChart = null;
  }
  redrawCharts() {
    const id = this.sheets.shown;
    if (id) {
      this.destroyCharts();
      this.buildSheet(id);
    }
  }
  // ApexCharts is fetched the first time a sheet that draws charts opens, then kept (the chunk is cached by the browser)
  loadCharts() {
    this.chartsLoad ??= loadApex().then(({ApexCharts}) => (this.ApexCharts = ApexCharts));
    return this.chartsLoad;
  }
  async buildSheet(id) {
    const tag = (this.sheetTag = Symbol());
    try {
      if (CHART_SHEETS.has(id)) await this.loadCharts();
    } catch {
      this.toast(this.store.t('charts.failed'), true);
      return;
    }
    if (tag !== this.sheetTag || !this.sheets.isOpen(id)) return;
    try {
      if (id === 'sh-energy') this.energySheet();
      if (id === 'sh-climate') this.climateSheet();
      if (id === 'sh-car') this.carSheet();
      if (id === 'sh-air') this.airSheet();
      if (id === 'sh-cam') this.camSheet();
      if (id === 'sh-sens') this.sensSheet();
      if (id === 'sh-light') this.renderLightSheet();
    } catch (e) {
      console.error('home-panel sheet', e);
    }
  }
  base(h) {
    return {
      chart: {
        height: h || 300,
        toolbar: {show: false},
        zoom: {enabled: false},
        fontFamily: this.css('--f-body'),
        foreColor: this.css('--fg2'),
        background: 'transparent',
        animations: {enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches},
      },
      grid: {borderColor: this.css('--line'), padding: {left: 6, right: 8}},
      legend: {show: false},
      dataLabels: {enabled: false},
      tooltip: {theme: this.dark() ? 'dark' : 'light'},
      xaxis: {axisBorder: {color: this.css('--line')}, axisTicks: {color: this.css('--line')}},
      noData: {text: 'No history yet'},
    };
  }
  // category axes on a phone: label every few bars instead of letting apex rotate or pile them up
  thin(cats, n, wide = cats.length) {
    const step = Math.ceil(cats.length / (this.$app.clientWidth < 600 ? n : wide)),
      keep = new Set(cats.filter((c, i) => i % step === 0));
    return {
      xaxis: {
        categories: cats,
        labels: {rotate: 0, hideOverlappingLabels: true, formatter: v => (keep.has(v) ? v : '')},
      },
      tooltip: {x: {formatter: v => v}},
    };
  }
  mk(id, opt) {
    if (this.store.isFrench) opt = this.french.apex(opt);
    const el = this.$(id);
    el.innerHTML = '';
    const c = new this.ApexCharts(el, opt);
    this.charts.push(c);
    // a chart with nothing to draw must not take the panel down with it
    const done = c.render();
    if (done && done.catch) done.catch(e => console.warn('home-panel chart', id, e && e.message));
    // to assistive tech a chart is an image, named after its card's title and the line under it
    const box = el.closest('.inner, .card'),
      h = box && box.querySelector('h3, .lbl'),
      p = box && box.querySelector('p');
    el.setAttribute('role', 'img');
    el.setAttribute(
      'aria-label',
      [h && h.textContent.trim(), p && p.textContent.trim()].filter(Boolean).join('. ') || 'Chart',
    );
    return c;
  }
  S() {
    return {
      ev: this.css('--c-ev'),
      heat: this.css('--c-heat'),
      wh: this.css('--c-wh'),
      home: this.css('--c-home'),
      rest: this.css('--c-rest'),
      card: this.css('--card'),
    };
  }
  groups(s) {
    return [
      [s.heat, 'Room heating', 'heat'],
      [s.wh, 'Water heating', 'wh'],
      [s.ev, 'EV charging', 'ev'],
      [s.rest, 'Rest of home', 'rest'],
    ];
  }
  legend(items) {
    return items.map(([c, t]) => `<span><b style="background:${c}"></b>${t}</span>`).join('');
  }

  energySheet() {
    this.$('esub').textContent = this.energySummary();
    const H = this.H,
      s = this.S();
    this.energyMain();
    this.cache.sankey = null;
    this.renderSankey();
    if (!H) return;
    const parts = this.groups(s).map(([c, n], i) => [n, H.g30[i], c]),
      tot = sum(parts.map(p => p[1]));
    this.mk(
      'c-donut',
      merge(this.base(190), {
        chart: {type: 'donut', height: 190},
        series: parts.map(p => +p[1].toFixed(1)),
        labels: parts.map(p => p[0]),
        colors: parts.map(p => p[2]),
        stroke: {width: 3, colors: [s.card]},
        plotOptions: {
          pie: {
            donut: {
              size: '70%',
              labels: {
                show: true,
                name: {show: true, fontSize: '12px', offsetY: 18},
                value: {
                  show: true,
                  fontSize: '22px',
                  fontWeight: 600,
                  fontFamily: this.css('--f-num'),
                  color: this.css('--fg'),
                  offsetY: -14,
                  formatter: v => Math.round(v) + '',
                },
                total: {
                  show: true,
                  label: 'kWh, 30 days',
                  fontSize: '11px',
                  color: this.css('--fg2'),
                  formatter: () => Math.round(tot) + '',
                },
              },
            },
          },
        },
        tooltip: {y: {formatter: v => v.toFixed(1) + ' kWh'}},
      }),
    );
    this.$('dt').innerHTML = parts
      .map(
        ([n, v, c]) =>
          `<tr><td><b style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:8px"></b>${n}</td><td class="r">${v.toFixed(1)} kWh</td><td class="r muted">${tot ? Math.round((v / tot) * 100) : 0}%</td></tr>`,
      )
      .join('');
    const t = H.totals,
      ri = this.rateInfo(),
      evDays = H.daily.slice(-30).filter(r => r.ev > 5).length;
    this.$('tot').innerHTML = [
      ['Today so far', f1(t.today), 'kWh', 'until ' + this.fmtEn.time(new Date())],
      ['Yesterday', t.yesterday == null ? '–' : f1(t.yesterday), 'kWh'],
      ['30 days', Math.round(t.d30), 'kWh', (t.d30 / 30).toFixed(1) + ' kWh a day'],
      [this.fmtEn.month(new Date(), 'long'), Math.round(t.month), 'kWh', 'so far'],
      ['EV, 30 days', Math.round(H.g30[2]), 'kWh', plural(evDays, 'charging day')],
      ['Rate now', ri.r == null ? '–' : (ri.r * 100).toFixed(2), '¢', 'Hilo ' + ri.tier.toLowerCase()],
    ]
      .map(tile)
      .join('');
  }
  energyMain() {
    if (!this.ApexCharts) return; // a tap while the chunk is loading; buildSheet draws it when it lands
    if (this.mainChart) {
      this.mainChart.destroy();
      this.charts = this.charts.filter(c => c !== this.mainChart);
      this.mainChart = null;
    }
    const H = this.H,
      s = this.S(),
      G = this.groups(s),
      el = this.$('el'),
      t = this.$('et'),
      p = this.$('es');
    el.innerHTML = this.legend(G);
    if (!H) {
      t.textContent = 'Loading history…';
      p.textContent = '';
      return;
    }
    const stack = {borderRadius: 3, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last'};
    if (this.range === 'today' || this.range === 'week') {
      const todayKey = this.fmtEn.isoDay(Date.now()),
        rows = this.range === 'today' ? H.flow.filter(r => this.fmtEn.isoDay(r[0]) === todayKey) : H.flow;
      t.textContent = this.range === 'today' ? 'Today, hour by hour' : 'Last 7 days, hour by hour';
      if (rows.length) {
        const pk = rows.reduce((a, r) => (r[5] > a[5] ? r : a), rows[0]);
        const at = new Date(pk[0]),
          when = (this.range === 'week' ? this.fmtEn.weekday(at, 'short') + ' ' : '') + this.fmtEn.time(at);
        p.textContent = `Busiest hour: ${pk[5].toFixed(1)} kWh, ${when}. Tap a bar to see what was running.`;
      } else p.textContent = 'No complete hour yet today.';
      const idx = {heat: 3, wh: 2, ev: 1, rest: 4};
      this.mainChart = this.mk(
        'c-main',
        merge(this.base(320), {
          chart: {type: 'bar', stacked: true},
          series: G.map(([, n, k]) => ({name: n, data: rows.map(r => [r[0], r[idx[k]]])})),
          colors: G.map(g => g[0]),
          plotOptions: {bar: {...stack, columnWidth: this.range === 'today' ? '70%' : '90%'}},
          stroke: {show: false},
          fill: {opacity: 1},
          xaxis: {type: 'datetime', labels: {datetimeUTC: false}},
          yaxis: {min: 0, tickAmount: 4, forceNiceScale: true, labels: {formatter: v => Math.round(v) + ' kWh'}},
          tooltip: {
            shared: true,
            intersect: false,
            x: {format: this.range === 'today' ? 'HH:mm' : 'ddd MMM d, HH:mm'},
            y: {formatter: v => v.toFixed(2) + ' kWh'},
          },
        }),
      );
    } else if (this.range === 'month') {
      const rows = H.daily.slice(-30),
        g = H.g30;
      t.textContent = 'Last 30 days, day by day';
      p.textContent = `${Math.round(sum(g))} kWh in 30 days: room heating ${Math.round(g[0])}, water heating ${Math.round(g[1])}, EV charging ${Math.round(g[2])}, rest of home ${Math.round(g[3])}.`;
      this.mainChart = this.mk(
        'c-main',
        merge(
          this.base(320),
          {
            chart: {type: 'bar', stacked: true},
            series: G.map(([, n, k]) => ({name: n, data: rows.map(r => +r[k].toFixed(1))})),
            colors: G.map(x => x[0]),
            plotOptions: {bar: {...stack, borderRadius: 4, columnWidth: '64%'}},
            stroke: {show: true, width: this.$app.clientWidth < 600 ? 1 : 2, colors: [s.card]},
            yaxis: {labels: {formatter: v => v.toFixed(0) + ' kWh'}},
            tooltip: {shared: true, intersect: false, y: {formatter: v => v.toFixed(1) + ' kWh'}},
          },
          this.thin(
            rows.map(r => this.fmtUtcEn.date(dayAt(r.day))),
            5,
          ),
        ),
      );
    } else {
      const rows = H.monthly,
        top = rows.reduce((a, r) => (r[1].heat > a[1].heat ? r : a), rows[0]);
      t.textContent = 'Month by month';
      p.textContent = `Last 12 months.${top && top[1].heat > 50 ? ` Room heating peaked in ${this.fmtUtcEn.month(monthAt(top[0]), 'long')}: ${this.fmtEn.integer(top[1].heat)} kWh.` : ''} Months with missing data look shorter.`;
      this.mainChart = this.mk(
        'c-main',
        merge(
          this.base(320),
          {
            chart: {type: 'bar', stacked: true},
            series: G.map(([, n, k]) => ({name: n, data: rows.map(r => +r[1][k].toFixed(1))})),
            colors: G.map(x => x[0]),
            plotOptions: {bar: {...stack, borderRadius: 6, columnWidth: '58%'}},
            stroke: {show: true, width: 2, colors: [s.card]},
            yaxis: {labels: {formatter: v => (v / 1000).toFixed(1) + ' MWh'}},
            tooltip: {shared: true, intersect: false, y: {formatter: v => Math.round(v) + ' kWh'}},
          },
          this.thin(
            rows.map(r => `${this.fmtUtcEn.month(monthAt(r[0]), 'short')} ${r[0].slice(2, 4)}`),
            4,
          ),
        ),
      );
    }
  }

  // ---------- weather ----------
  // The Weather pane's ForecastController owns the forecast subscription (spec 15) and the shell tells the guest of each message:
  // Home's card (`wxDays`) still reads `this.fc`. Deleted with its last reader (the Home move).
  forecastChanged(type, forecast) {
    this.fc[type] = forecast;
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

  // ---------- cameras (UniFi Protect, or any camera entity) ----------
  cameras() {
    const reg = this.hass.entities || {},
      seen = new Map();
    Object.keys(this.hass.states)
      .filter(id => id.startsWith('camera.'))
      .forEach(id => {
        const r = reg[id] || {};
        if (r.hidden || (r.platform && r.platform !== 'unifiprotect') || /_radar$/.test(id) || /insecure/.test(id))
          return;
        if (!r.platform && !/unifi|protect/i.test(this.attr(id, 'attribution') || '')) return;
        // one tile per camera: Protect makes a high, medium and low channel per device
        const dev = r.device_id || id,
          rank = /_high|high_resolution/.test(id) ? 0 : /_medium/.test(id) ? 1 : /_low/.test(id) ? 3 : 2,
          prev = seen.get(dev);
        if (!prev || rank < prev.rank) seen.set(dev, {id, dev, rank});
      });
    return [...seen.values()]
      .map(c => {
        const mo = Object.values(reg).filter(
          e =>
            e.device_id === c.dev &&
            e.entity_id.startsWith('binary_sensor.') &&
            /motion/.test(e.entity_id) &&
            !/detection/.test(e.entity_id),
        );
        const motion = mo.find(e => /_motion$/.test(e.entity_id)) || mo[0];
        const dn = this.deviceName(c.dev, this.name(c.id));
        return {
          ...c,
          name: String(dn).replace(/\s+(High|Medium|Low)( Resolution Channel)?$/i, ''),
          motion: motion && this.st(motion.entity_id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  renderCameras() {
    const cams = this.cameras(),
      stamp = Math.floor(Date.now() / 10000);
    if (!cams.length) {
      this.set(
        'cams',
        `<div class="top"><span class="lbl">Cameras</span><span class="right">Not connected</span></div>
        <div class="camempty">${ico('cam', 34)}<div><b>No cameras yet</b><span>Add UniFi Protect in Settings → Devices &amp; services, with a local Protect user. Your cameras show up here on their own.</span>
        <a class="more" href="/config/integrations/dashboard/add?domain=unifiprotect" target="_top">Add UniFi Protect</a></div></div>`,
      );
      return;
    }
    this.set(
      'cams',
      `<div class="top"><span class="lbl">Cameras</span><span class="right">${plural(cams.length, 'camera')}</span></div>
      <div class="camgrid">${cams
        .map(c => {
          const s = this.st(c.id),
            pic = s && s.attributes.entity_picture,
            m = c.motion,
            moving = m && m.state === 'on';
          const when =
            m && ok(m)
              ? moving
                ? 'Motion now'
                : `Motion ${this.ago(m.last_changed)}`
              : ok(s)
                ? cap(s.state)
                : 'Offline';
          return `<button type="button" class="cam" data-cam="${esc(c.id)}" aria-description="Opens the live view">${ok(s) && pic ? `<img src="${esc(pic)}&t=${stamp}" alt="" loading="lazy">` : `<span class="camoff">${ico('cam', 26)}</span>`}
          <span class="camlbl"><b>${esc(c.name)}</b><small>${moving ? '<i class="mdot"></i>' : ''}${esc(when)}</small></span></button>`;
        })
        .join('')}</div>`,
    );
  }
  // ---------- air quality (Mila purifiers) ----------
  purifiers() {
    const reg = this.hass.entities || {},
      dev = this.hass.devices || {},
      by = {};
    for (const e of Object.values(reg))
      if (e.platform === 'mila' && e.device_id) (by[e.device_id] = by[e.device_id] || []).push(e.entity_id);
    const rooms = [],
      find = (ids, re) => ids.find(i => re.test(i));
    let outside = null;
    for (const [d, ids] of Object.entries(by)) {
      const fan = find(ids, /^fan\./);
      if (!fan) {
        // the account-level device carries the outdoor station and pollen
        if (find(ids, /_aqi$/))
          outside = {
            aqi: find(ids, /_aqi$/),
            pm: find(ids, /_station_pm2_5$/),
            dist: find(ids, /_station_distance$/),
            pollen: POLLEN.map(([k, l]) => [l, find(ids, new RegExp('_pollen_status_' + k + '$'))]),
          };
        continue;
      }
      const D = dev[d] || {},
        s = {};
      for (const k of AIR_KEYS) s[k] = find(ids, new RegExp('^sensor\\..*_' + k + '$'));
      rooms.push({
        dev: d,
        fan,
        s,
        aid: D.area_id || '',
        // the area's name, else the device's, else the fan's
        name: this.areaName(D.area_id, this.deviceName(d, this.name(fan))),
      });
    }
    rooms.sort((a, b) => a.name.localeCompare(b.name));
    return {rooms, outside};
  }
  // a room's overall rating is Mila's own air quality index (US AQI, mostly particles), so it matches the Mila app;
  // CO₂ and VOC are still listed when they run high, without changing that rating
  roomAir(r) {
    const lv = Object.keys(AQ).map(k => {
        const v = this.num(r.s[k]);
        return {k, v, l: aqLevel(k, v)};
      }),
      mila = this.num(r.s.air_quality);
    const worst = mila != null ? outLevel(mila) : Math.max(-1, ...lv.map(x => x.l)),
      top = Math.max(0, ...lv.map(x => x.l));
    return {lv, worst, mila, why: top > 0 ? lv.filter(x => x.l === top) : []};
  }
  airSummary(P) {
    const A = P.rooms.map(r => ({r, a: this.roomAir(r)})),
      worst = Math.max(-1, ...A.map(x => x.a.worst)),
      good = A.filter(x => x.a.worst === 0).length;
    const bad = A.filter(x => x.a.worst === worst && worst > 0);
    const why = bad
      .map(
        x =>
          `${x.r.name}: ${x.a.why.length ? x.a.why.map(w => `${AQ[w.k].name} ${aqFmt(this.fmtEn, w.k, w.v)}`).join(', ') : `Mila index ${Math.round(x.a.mila)}`}`,
      )
      .join(' · ');
    return {A, worst, good, why};
  }
  renderAir() {
    const P = this.purifiers();
    if (!P.rooms.length) {
      this.set(
        'air',
        '<div class="top"><span class="lbl">Air quality</span><span class="right">No purifiers found</span></div>',
      );
      return;
    }
    const {A, worst, good, why} = this.airSummary(P),
      o = P.outside,
      oa = o && this.num(o.aqi),
      ol = outLevel(oa);
    const head =
      worst <= 0
        ? `${good === A.length ? `All ${plural(A.length, 'room')} clean` : `${good} of ${A.length} rooms clean`}`
        : esc(why);
    this.set(
      'air',
      `<div class="top"><span class="lbl">Air quality</span><span class="right">${oa == null ? '' : `Outside AQI <b class="num" style="color:var(--fg)">${Math.round(oa)}</b> ${AQ_LVL[ol][0]}`}<span class="go">›</span></span></div>
      <div class="aqsum lv${Math.max(0, worst)}"><span class="state"><i></i>${worst < 0 ? 'No data' : AQ_LVL[worst][0]}</span><span class="why">${head}</span></div>
      <div class="rooms">${A.map(({r, a}) => {
        const f = this.st(r.fan),
          auto = f && f.attributes.preset_mode === 'Automagic',
          pct = f && f.state === 'on' ? f.attributes.percentage : 0;
        const m = k => {
          const v = this.num(r.s[k]);
          return `<span class="${aqLevel(k, v) > 0 ? 'hi' : ''}"><b class="num">${aqFmt(this.fmtEn, k, v, true)}</b><small>${AQ[k].name}</small></span>`;
        };
        return `<div class="room aqroom lv${Math.max(0, a.worst)}"><div class="n"><i></i>${esc(r.name)}</div>
          <div class="aqm">${m('pm2_5')}${m('co2')}${m('voc')}</div>
          <div class="s">${!f || !ok(f) ? 'Purifier offline' : f.state !== 'on' ? 'Fan off' : `${auto ? 'Automagic' : 'Manual'} · ${pct}%`}${this.num(r.s.humidity) == null ? '' : ` · ${Math.round(this.num(r.s.humidity))}% RH`}</div></div>`;
      }).join('')}</div>`,
    );
  }

  // detail sheet: rooms with their purifier controls, one chart per pollutant, outside air
  airSheet() {
    this.airRange = this.airRange || 'day';
    this.airMetric = this.airMetric || 'pm2_5';
    this.root
      .querySelectorAll('#atabs .tab')
      .forEach(t => t.setAttribute('aria-selected', t.dataset.r === this.airRange));
    this.cache.arooms = this.cache.aout = null;
    this.renderAirLive();
    this.airChart();
  }
  renderAirLive() {
    const P = this.purifiers(),
      {A, worst, why} = this.airSummary(P);
    this.$('asub').textContent =
      worst < 0 ? 'No readings yet' : worst === 0 ? `${AQ_LVL[0][0]} in every room` : `${AQ_LVL[worst][0]} · ${why}`;
    this.set(
      'arooms',
      A.map(({r, a}) => {
        const f = this.st(r.fan),
          on = f && f.state === 'on',
          auto = f && f.attributes.preset_mode === 'Automagic',
          pct = this.pend(r.fan + ':pct', on ? f.attributes.percentage : 0),
          mode = this.pend(r.fan + ':mode', auto ? 'Automagic' : 'Manual');
        const t = (k, lbl) => {
          const v = this.num(r.s[k]);
          return `<div class="tile${k in AQ && aqLevel(k, v) > 0 ? ' hi' : ''}"><div class="k">${lbl || AQ[k].name}</div><div class="v num">${k in AQ ? aqFmt(this.fmtEn, k, v) : v == null ? '–' : Math.round(v)}<small>${k in AQ ? AQ[k].unit : k === 'humidity' ? '%' : 'µg/m³'}</small></div></div>`;
        };
        return `<div class="aqcard lv${Math.max(0, a.worst)}">
        <div class="aqhead"><div><h3>${esc(r.name)}</h3><p>${a.worst < 0 ? 'No readings' : !a.why.length ? (a.worst > 0 ? `Mila index ${Math.round(a.mila)}` : 'Clean air') : esc(a.why.map(w => `${AQ[w.k].name} ${AQ_LVL[w.l][0].toLowerCase()}`).join(', '))}${this.num(r.s.temperature) == null ? '' : ` · ${f1(this.num(r.s.temperature))}°`}</p></div><span class="state"><i></i>${a.worst < 0 ? '–' : AQ_LVL[a.worst][0]}</span></div>
        <div class="tiles aqt">${t('pm2_5')}${t('co2')}${t('voc')}${t('co')}${t('pm1', 'PM1')}${t('pm10', 'PM10')}${t('humidity', 'Humidity')}</div>
        ${
          !f || !ok(f)
            ? '<p class="muted">The purifier is offline, so it can\'t be adjusted right now.</p>'
            : `<div class="aqctl">
          <div class="seg" role="radiogroup" aria-label="${esc(r.name)} mode">${[
            ['Automagic', 'Automagic'],
            ['Manual', 'Manual'],
          ]
            .map(
              ([v, l]) =>
                `<button type="button" role="radio" aria-checked="${v === mode}" data-a="mode" data-f="${esc(r.fan)}" data-v="${v}"><b>${l}</b></button>`,
            )
            .join('')}</div>
          ${
            mode === 'Manual'
              ? `<div class="stepper" role="group" aria-label="${esc(r.name)} fan speed"><button type="button" data-a="pct" data-f="${esc(r.fan)}" data-d="-10" aria-label="Slower" ${pct <= 10 ? 'disabled' : ''}>−</button><div class="sv"><b class="num">${pct}%</b><small>Fan</small></div><button type="button" data-a="pct" data-f="${esc(r.fan)}" data-d="10" aria-label="Faster" ${pct >= 100 ? 'disabled' : ''}>+</button></div>`
              : `<p class="hint">Automagic sets the fan from the room's sensors${on ? `, now ${pct}%` : ''}${this.num(r.s.air_changes) == null ? '' : `, ${f1(this.num(r.s.air_changes))} air changes an hour`}.</p>`
          }</div>`
        }
      </div>`;
      }).join(''),
    );
    const o = P.outside;
    if (o) {
      const oa = this.num(o.aqi),
        ol = outLevel(oa),
        pm = this.num(o.pm),
        d = this.num(o.dist);
      this.set(
        'aout',
        `<div class="aqsum lv${ol}"><span class="state"><i></i>${oa == null ? 'No data' : AQ_LVL[ol][0]}</span><span class="why">AQI <b class="num">${oa == null ? '–' : Math.round(oa)}</b>${this.num(this.E.aqhi) == null ? '' : ` · AQHI ${this.num(this.E.aqhi)}`}${pm == null ? '' : ` · PM2.5 ${f1(pm)} µg/m³`}${d == null ? '' : ` · station ${Math.round(d)} km away`}</span></div>
        ${o.pollen.some(([, id]) => ok(this.st(id))) ? `<div class="tiles" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:10px">${o.pollen.map(([l, id]) => tile([l + ' pollen', ok(this.st(id)) ? esc(cap(this.st(id).state)) : '–'])).join('')}</div>` : '<p class="hint">No pollen report from the station yet; it shows up here once Mila has one.</p>'}`,
      );
    }
  }
  async loadAirRange(r) {
    const k = r + ':' + this.airMetric,
      c = (this.AR = this.AR || {})[k];
    if (c && Date.now() - c.at < 10 * 60000) return c;
    const P = this.purifiers(),
      R = CRANGE[r],
      start = new Date(Date.now() - R.days * 864e5),
      m = this.airMetric;
    const ids = P.rooms.map(x => x.s[m]).filter(Boolean),
      out = m === 'pm2_5' && P.outside && P.outside.pm;
    const stt = await this.api.statistics(out ? [...ids, out] : ids, R.period, start, ['mean']);
    const ser = id =>
      (stt[id] || []).filter(x => x.mean != null).map(x => [ms(x.start) + R.mid, +(+x.mean).toFixed(1)]);
    return (this.AR[k] = {
      at: Date.now(),
      start: start.getTime(),
      rooms: P.rooms.map(x => ({name: x.name, pts: ser(x.s[m])})),
      out: out ? ser(out) : null,
    });
  }
  async airChart() {
    if (!this.ApexCharts) return; // a tap while the chunk is loading; buildSheet draws it when it lands
    const r = this.airRange,
      m = this.airMetric,
      tag = (this.airTag = Symbol()),
      R = CRANGE[r],
      A = AQ[m] || {name: 'Humidity', unit: '%', b: [60, 70]};
    this.root.querySelectorAll('#ametric button').forEach(b => b.setAttribute('aria-checked', b.dataset.m === m));
    this.$('aqch').textContent = `${A.name}, ${R.label}`;
    this.$('aqcp').textContent =
      m === 'humidity'
        ? 'Comfortable indoor humidity is 30 to 60%.'
        : `Good is up to ${A.b[0]} ${A.unit}, moderate up to ${A.b[1]}.${m === 'pm2_5' ? ' The dashed line is the outdoor station.' : ''}`;
    let C;
    try {
      C = await this.loadAirRange(r);
    } catch (e) {
      if (e instanceof StaleReply) return;
      console.error('home-panel air history', e);
      this.$('c-air').innerHTML = '<p>History is not available right now.</p>';
      return;
    }
    if (tag !== this.airTag || !this.sheets.isOpen('sh-air')) return;
    if (this.airC) {
      try {
        this.airC.destroy();
      } catch {}
      this.charts = this.charts.filter(c => c !== this.airC);
    }
    const s = this.S(),
      cols = [s.home, s.wh, s.heat, s.ev],
      series = C.rooms.map(x => ({name: x.name, data: x.pts}));
    if (C.out) series.push({name: 'Outside', data: C.out});
    this.$('alegend').innerHTML = this.legend([
      ...C.rooms.map((x, i) => [cols[i % 4], esc(x.name)]),
      ...(C.out ? [[s.rest, 'Outside']] : []),
    ]);
    const band = m === 'humidity' ? [{y: 30, y2: 60}] : [{y: 0, y2: A.b[0]}];
    this.airC = this.mk(
      'c-air',
      merge(this.base(280), {
        chart: {type: 'line'},
        series,
        colors: [...C.rooms.map((x, i) => cols[i % 4]), s.rest],
        stroke: {
          width: series.map((x, i) => (C.out && i === series.length - 1 ? 1.6 : 2.2)),
          dashArray: series.map((x, i) => (C.out && i === series.length - 1 ? 5 : 0)),
          curve: 'smooth',
        },
        annotations: {
          yaxis: band.map(b => ({
            ...b,
            fillColor: this.css('--ok'),
            opacity: 0.1,
            borderColor: 'transparent',
            label: {
              text: m === 'humidity' ? 'Comfortable' : 'Good',
              position: 'left',
              textAnchor: 'start',
              offsetX: 8,
              borderWidth: 0,
              style: {background: 'transparent', color: this.css('--fg3'), fontSize: '11px'},
            },
          })),
        },
        xaxis: {type: 'datetime', min: C.start, max: Date.now(), labels: {datetimeUTC: false}},
        yaxis: {
          min: 0,
          forceNiceScale: true,
          labels: {formatter: v => (v == null ? '' : this.fmtEn.integer(v))},
        },
        tooltip: {
          shared: true,
          x: {format: R.tipFmt},
          y: {
            formatter: v => (v == null ? '–' : `${this.fmtEn.number(+v, 1)} ${A.unit}`),
          },
        },
      }),
    );
    this.airOutChart();
  }
  // outdoor air over the same range: the Mila station's US AQI, and Environment Canada's AQHI when it has statistics
  async airOutChart() {
    if (!this.ApexCharts) return; // a tap while the chunk is loading; buildSheet draws it when it lands
    const box = this.$('c-aout');
    if (!box) return;
    const o = this.purifiers().outside,
      aqhi = this.st(this.E.aqhi) ? this.E.aqhi : null,
      ids = [o && o.aqi, aqhi].filter(Boolean);
    if (!ids.length) {
      box.innerHTML = '';
      this.$('aolegend').innerHTML = '';
      return;
    }
    const r = this.airRange,
      R = CRANGE[r],
      tag = (this.aoTag = Symbol()),
      k = 'out:' + r,
      c0 = (this.AR = this.AR || {})[k];
    let C = c0 && Date.now() - c0.at < 10 * 60000 ? c0 : null;
    if (!C) {
      try {
        const start = new Date(Date.now() - R.days * 864e5),
          stt = await this.api.statistics(ids, R.period, start, ['mean']);
        const ser = id =>
          id ? (stt[id] || []).filter(x => x.mean != null).map(x => [ms(x.start) + R.mid, +(+x.mean).toFixed(1)]) : [];
        C = this.AR[k] = {at: Date.now(), start: start.getTime(), aqi: ser(o && o.aqi), aqhi: ser(aqhi)};
      } catch (e) {
        if (e instanceof StaleReply) return;
        console.error('home-panel outdoor air history', e);
        box.innerHTML = '<p>History is not available right now.</p>';
        return;
      }
    }
    if (tag !== this.aoTag || !this.sheets.isOpen('sh-air')) return;
    if (this.aoC) {
      try {
        this.aoC.destroy();
      } catch {}
      this.charts = this.charts.filter(c => c !== this.aoC);
      this.aoC = null;
    }
    this.$('aoh').textContent = `Outdoor air, ${R.label}`;
    if (!C.aqi.length && !C.aqhi.length) {
      box.innerHTML = '<p class="loading">No outdoor history yet</p>';
      this.$('aolegend').innerHTML = '';
      return;
    }
    const lbl = t => ({
      text: t,
      position: 'left',
      textAnchor: 'start',
      offsetX: 8,
      borderWidth: 0,
      style: {background: 'transparent', color: this.css('--fg3'), fontSize: '11px'},
    });
    const ax = (name, t, extra) => ({
      seriesName: name,
      min: 0,
      title: {text: t, style: {color: this.css('--fg3'), fontWeight: 500}},
      labels: {formatter: v => Math.round(v) + ''},
      ...extra,
    });
    const series = [],
      colors = [],
      yaxis = [];
    if (C.aqi.length) {
      series.push({name: 'AQI (Mila station)', data: C.aqi});
      colors.push(this.css('--m-orange'));
      yaxis.push(ax('AQI (Mila station)', 'US AQI', {forceNiceScale: true}));
    }
    if (C.aqhi.length) {
      series.push({name: 'AQHI (Environment Canada)', data: C.aqhi});
      colors.push(this.css('--m-purple'));
      yaxis.push(ax('AQHI (Environment Canada)', 'AQHI', {opposite: true, max: 10, tickAmount: 5}));
    }
    this.$('aolegend').innerHTML = this.legend(series.map((x, i) => [colors[i], x.name]));
    this.aoC = this.mk(
      'c-aout',
      merge(this.base(240), {
        chart: {type: 'line'},
        series,
        colors,
        stroke: {width: 2, curve: 'smooth'},
        xaxis: {type: 'datetime', min: C.start, max: Date.now(), labels: {datetimeUTC: false}},
        yaxis,
        annotations: C.aqi.length
          ? {
              yaxis: [
                {
                  y: 0,
                  y2: 50,
                  fillColor: this.css('--ok'),
                  opacity: 0.1,
                  borderColor: 'transparent',
                  label: lbl('Good'),
                },
                {
                  y: 50,
                  y2: 100,
                  fillColor: this.css('--warn'),
                  opacity: 0.08,
                  borderColor: 'transparent',
                  label: lbl('Moderate'),
                },
              ],
            }
          : {},
        tooltip: {shared: true, x: {format: R.tipFmt}, y: {formatter: v => (v == null ? '–' : Math.round(v) + '')}},
      }),
    );
  }
  airControl(e) {
    const t = e.target.closest('[data-r]');
    if (t && t.closest('#atabs')) {
      this.airRange = t.dataset.r;
      this.root
        .querySelectorAll('#atabs .tab')
        .forEach(x => x.setAttribute('aria-selected', x.dataset.r === this.airRange));
      this.airChart();
      return;
    }
    const mm = e.target.closest('[data-m]');
    if (mm) {
      this.airMetric = mm.dataset.m;
      this.airChart();
      return;
    }
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const fan = b.dataset.f,
      f = this.st(fan);
    if (!f) return;
    const hold = (key, v) => {
      this.pending[key] = {v, until: Date.now() + 20000};
    };
    const name = (this.purifiers().rooms.find(x => x.fan === fan) || {}).name || 'Purifier';
    if (b.dataset.a === 'mode') {
      hold(fan + ':mode', b.dataset.v);
      this.call('fan', 'set_preset_mode', {entity_id: fan, preset_mode: b.dataset.v}, `${name}: ${b.dataset.v}`);
    } else if (b.dataset.a === 'pct') {
      const cur = +this.pend(fan + ':pct', f.state === 'on' ? f.attributes.percentage : 0),
        v = Math.min(100, Math.max(10, cur + +b.dataset.d));
      hold(fan + ':pct', v);
      // taps are collected and sent once they stop
      clearTimeout(this.spT && this.spT[fan]);
      this.spT = this.spT || {};
      this.spT[fan] = setTimeout(
        () => this.call('fan', 'set_percentage', {entity_id: fan, percentage: v}, `${name} fan ${v}%`),
        900,
      );
    }
    this.cache.arooms = null;
    this.renderAirLive();
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
  // ---------- door and motion sensors ----------
  sensors() {
    const reg = this.hass.entities || {},
      dev = this.hass.devices || {},
      out = [];
    for (const id of Object.keys(this.hass.states)) {
      if (!id.startsWith('binary_sensor.')) continue;
      const e = reg[id] || {},
        dc = this.attr(id, 'device_class'),
        kind = DOOR_DC.includes(dc) ? 'door' : MOTION_DC.includes(dc) ? 'motion' : null;
      // camera motion already shows on the camera tiles
      if (!kind || e.platform === 'unifiprotect' || e.hidden || e.entity_category) continue;
      const D = dev[e.device_id] || {},
        aid = e.area_id || D.area_id || '',
        sib = e.device_id ? Object.values(reg).filter(x => x.device_id === e.device_id) : [];
      const pick = re => (sib.find(x => re.test(x.entity_id)) || {}).entity_id;
      out.push({
        id,
        kind,
        dc,
        aid,
        area: aid ? this.name(aid) : '',
        name: sensorName(this.deviceName(e.device_id, this.name(id))),
        bat: pick(/^sensor\..*_battery$/),
        lux: pick(/^sensor\..*_illuminance$/),
      });
    }
    return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'door' ? -1 : 1) || a.name.localeCompare(b.name));
  }
  sensorState(x) {
    const s = this.st(x.id),
      b = this.num(x.bat),
      lux = this.num(x.lux);
    if (!ok(s)) return {cls: 'off', main: 'Offline', sub: ''};
    const on = s.state === 'on',
      since = this.ago(s.last_changed);
    const low = b != null && b < 20 ? `battery ${Math.round(b)}%` : '';
    if (x.kind === 'door')
      return {
        cls: on ? 'warn' : '',
        main: on ? 'Open' : 'Closed',
        sub: [on ? 'for ' + since.replace(' ago', '') : since, low].filter(Boolean).join(' · '),
      };
    return {
      cls: on ? 'act' : '',
      main: on ? 'Motion now' : 'No motion',
      sub: [on ? '' : since, lux == null ? '' : Math.round(lux) + ' lx', low].filter(Boolean).join(' · '),
    };
  }
  sensorChip(x) {
    const S = this.sensorState(x);
    return `<button type="button" class="schip ${S.cls}" data-sens="${esc(x.id)}" aria-description="Opens the history"><span class="sic">${ico(x.kind === 'door' ? 'door' : 'walk', 17)}</span><div><b>${esc(x.name)}</b><span><em>${esc(S.main)}</em>${S.sub ? ' · ' + esc(S.sub) : ''}</span></div></button>`;
  }
  renderSensors() {
    const X = this.sensors(),
      el = this.$('sensors');
    if (!el) return;
    el.hidden = !X.length;
    if (!X.length) return;
    const open = X.filter(x => x.kind === 'door' && (this.st(x.id) || {}).state === 'on').length,
      doors = X.filter(x => x.kind === 'door').length;
    this.set(
      'sensors',
      `<div class="top"><span class="lbl">Doors &amp; motion</span><span class="right">${doors ? (open ? `<b style="color:var(--warn)">${plural(open, 'door')} open</b>` : doors === 1 ? 'Door closed' : 'All doors closed') : ''}</span></div>
      <div class="sgrid">${X.map(x => this.sensorChip(x)).join('')}</div>`,
    );
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
  // on a phone the old summary cards become the panes (the five detail panels are the sheet host's)
  placePanels(compact = this.compact) {
    const col = this.root.querySelector('.col.c1'),
      mv = (id, h) => {
        const el = this.$(id);
        if (el && h && el.parentNode !== h) h.appendChild(el);
      };
    const homes = {'open-car': 'carhost', 'open-energy': 'ehost', 'open-air': 'airhost'};
    for (const [id, host] of Object.entries(homes)) mv(id, compact ? this.$(host) : col);
  }
  renderCompact() {
    if (!this.compact || this.view !== 'tabs') return;
    for (const f of ['renderLightTiles', 'renderClimateTiles', 'renderEnergyTiles', 'renderCompactSubs']) {
      try {
        this[f]();
      } catch (e) {
        console.error('home-panel phone', f, e);
      }
    }
  }
  // one line under each summary pane's title, as the sheets have
  renderCompactSubs() {
    if (this.tab === 'climate') this.set('csub2', this.climateSummary());
    if (this.tab === 'energy') this.set('esub2', this.energySummary());
    if (this.tab === 'car') {
      const c = this.car ? this.carState() : null;
      this.set('carh2', this.car ? esc(this.carName()) : 'Car');
      this.set(
        'carsub2',
        c
          ? [
              c.where,
              `${f1(c.soc)}%${c.range != null ? ' · ' + Math.round(c.range) + ' km' : ''}`,
              c.charging ? 'charging' : c.plugged ? 'plugged in' : 'unplugged',
            ]
              .filter(Boolean)
              .join(' · ')
          : 'No FordPass car found.',
      );
    }
    if (this.tab === 'air') {
      const P = this.purifiers(),
        a = P.rooms.length ? this.airSummary(P) : null;
      this.set(
        'asub2',
        !a
          ? 'No purifiers found'
          : [
              plural(P.rooms.length, 'purifier'),
              a.worst < 0 ? 'no data' : AQ_LVL[a.worst][0],
              a.worst > 0 ? esc(a.why) : '',
            ]
              .filter(Boolean)
              .join(' · '),
      );
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
  // Climate: the same list as the sheet's, as tiles; a tile opens the sheet on that room
  // the heat pump's maker, from its device (FGLair units are Fujitsu's)
  hpBrand() {
    const e = (this.hass.entities || {})[this.E.hp] || {},
      d = (this.hass.devices || {})[e.device_id] || {};
    return /fglair/.test(e.platform || '') || /fujitsu/i.test(d.manufacturer || '')
      ? 'Fujitsu'
      : d.manufacturer || 'Heat pump';
  }
  climItems() {
    const L = this.live(),
      temps = L.rooms.map(r => r.t).filter(v => v != null),
      avg = temps.length ? sum(temps) / temps.length : null;
    const n = L.rooms.filter(r => r.heating).length,
      hp = L.hp;
    const B = this.hpBrand(),
      hpSb = !hp
        ? 'Not found'
        : !ok(hp)
          ? `${B} · offline`
          : hp.state === 'off'
            ? `${B} · off`
            : `${B} · ${hp.attributes.hvac_action || hp.state}${hp.attributes.temperature != null ? ' to ' + hp.attributes.temperature + '°' : ''}`;
    return [
      {
        id: 'house',
        icon: 'house',
        nm: 'Whole house',
        sb: `${L.hpOn ? 'Heat pump + ' : ''}${plural(n, 'room')} heating`,
        tv: avg == null ? '–' : avg.toFixed(1) + '°',
        cls: n || L.hpOn ? 'on' : '',
      },
      ...L.rooms.map(r => ({
        id: r.k,
        icon: r.icon,
        nm: r.name,
        sb: !r.ok
          ? 'Unavailable'
          : r.heating
            ? `Heating · ${r.p.toFixed(2)} kW`
            : r.sp > 5.5
              ? `Holding ${r.sp}°`
              : 'Off',
        tv: f1(r.t) + '°',
        cls: r.heating ? 'on' : !r.ok ? 'bad' : '',
      })),
      ...(this.E.hp
        ? [
            {
              id: 'hp',
              icon: 'fan',
              nm: 'Heat pump',
              sb: hpSb,
              tv:
                ok(hp) && hp.attributes.current_temperature != null ? f1(hp.attributes.current_temperature) + '°' : '–',
              cls: !ok(hp) ? 'bad' : L.hpOn ? 'on' : '',
            },
          ]
        : []),
    ];
  }
  renderClimateTiles() {
    if (this.tab !== 'climate') return;
    this.set(
      'ctiles2',
      this.climItems()
        .map(
          i =>
            `<button type="button" class="stile ${i.cls}${i.id === 'house' ? ' wide' : ''}" data-csel="${i.id}"><span class="ic">${ico(i.icon, 20)}</span><span class="tx"><b>${esc(i.nm)}</b><small>${esc(i.sb)}</small></span><span class="tv num">${i.tv}</span></button>`,
        )
        .join(''),
    );
  }
  // Energy: the water heater and Hilo as rows; each opens its full card in a sheet
  renderEnergyTiles() {
    if (this.tab !== 'energy') return;
    const whT = this.num(this.E.whT),
      whP = this.kw(this.E.whP) || 0,
      ri = this.rateInfo(),
      defi = this.st(this.E.defi);
    const ch = !ok(defi)
      ? 'Challenge status unknown'
      : defi.state === 'off'
        ? 'No challenge scheduled'
        : `Challenge: ${esc(defi.state)}`;
    this.set(
      'etiles',
      `<button type="button" class="stile wide${whP > 0.02 ? ' on' : ''}" data-card="water" data-title="Water heater" data-icon="drop" data-color="var(--c-wh)"><span class="ic">${ico('drop', 20)}</span><span class="tx"><b>Water heater</b><small>${whP > 0.02 ? `Heating · ${whP.toFixed(1)} kW` : 'Idle'}</small></span><span class="tv num">${f1(whT)}°</span></button>
      <button type="button" class="stile wide grid" data-card="hilo" data-title="Hilo" data-icon="bolt" data-color="var(--c-grid)"><span class="ic">${ico('bolt', 20)}</span><span class="tx"><b>Hilo</b><small>${esc(ri.tier)} · ${ch}</small></span><span class="tv num">${ri.r == null ? '–' : (ri.r * 100).toFixed(2)}<small>¢</small></span></button>`,
    );
  }
  // any card can open in a sheet: it moves there and keeps updating, then goes back where it was
  openCard(id, title, icon, color) {
    const el = this.$(id);
    if (!el) return;
    this.sheets.close(); // the card of an earlier tap goes home first
    this.cardBack = {el, parent: el.parentNode, next: el.nextSibling};
    this.$('cardhost').appendChild(el);
    el.hidden = false;
    const b = this.$('cardb');
    b.style.setProperty('--acc', color || 'var(--c-home)');
    b.innerHTML = ico(icon || 'house', 26);
    this.$('cardh').textContent = title || '';
    this.sheets.open('sh-card');
  }
  // the word under each section in the phone's More sheet, in English, for the registry's summary
  moreLines() {
    const L = this.live(),
      isOn = i => (this.st(i) || {}).state === 'on';
    // Media's line is the feature's own (mediaBrief, #217)
    const P = this.purifiers(),
      air = P.rooms.length ? this.airSummary(P) : null;
    const X = this.sensors(),
      open = X.filter(x => x.kind === 'door' && isOn(x.id)).length,
      moving = X.some(x => x.kind === 'motion' && isOn(x.id));
    const A = this.auAutos ? this.auAutos() : [],
      running = A.filter(a => a.current).length;
    const sb = {
      energy: L.grid == null ? '' : `${L.grid < 1 ? Math.round(L.grid * 1000) + ' W' : L.grid.toFixed(2) + ' kW'} now`,
      air: !air ? 'No purifiers' : air.worst < 0 ? 'No data' : AQ_LVL[air.worst][0],
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
    this.placePanels();
    mv('lights', 'lhost');
    mv('water', 'eside');
    mv('hilo', 'eside');
    mv('cams', 'camhost');
    mv('sensors', 'senhost');
    this.tabChanged(this.tab);
  }
  leaveTabs() {
    this.placePanels(true);
    this.placePanels(false); // panels back to their sheets, cards back to the columns
    this.plan = null; // the cards go back into the columns on the next layout
  }
  // the shell shows the pane of `t` (it remembered the tab and drew the rail and the panes); this is the guest's part
  tabChanged(t) {
    if (!this.$app || this.view !== 'tabs') return; // nothing drawn yet: enterTabs asks again once it is
    const prev = this.drawnTab;
    this.drawnTab = t;
    if (t === 'lights' && prev !== t) this.loadLightOrder(); // another screen may have rearranged them
    if (t !== 'lights' && this.lightEdit) this.setLightEdit(false);
    this.sheets.paneShown(t); // the host shows this pane's detail panel inline, on a tablet
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
  // what the house lacks is hidden wherever it shows. The rail's Climate and Car buttons are the shell's: it asks availability()
  // and draws the rail from the answer. The Home tiles that open them, the water heater and the Hilo cards with the tiles that
  // open them are the guest's, and it hides them here. It runs last in renderTabs because the renderers above redraw their
  // tiles whole: a hide that ran before a redraw let the new tile show until the next update hid it again
  gateLacking() {
    const L = this.lacking(),
      hide = (sel, off) =>
        this.root.querySelectorAll(sel).forEach(el => {
          el.hidden = off;
        });
    for (const t of ['climate', 'car']) hide(`[data-pane="${t}"]`, L[t]);
    for (const c of ['water', 'hilo']) hide(`#${c}, [data-card="${c}"]`, L[c]);
    const key = JSON.stringify(this.availability());
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.ctx.shell.requestFrame();
    }
  }
  // which tabs this house lacks (false: nothing for it), for the shell's registry; no opinion until a hass arrived
  availability() {
    if (!this.hass) return {};
    const L = this.lacking();
    return {climate: !L.climate, car: !L.car};
  }
  // whether the history behind the charts has loaded, which the settings popup's version line says
  statisticsLoaded() {
    return Boolean(this.H);
  }
  // one line under each pane title, like the detail sheets have
  renderPaneSubs() {
    const isOn = i => (this.st(i) || {}).state === 'on',
      L = this.live(),
      att = this.attention();
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
    const temps = L.rooms.map(r => r.t).filter(v => v != null),
      avg = temps.length ? sum(temps) / temps.length : null,
      out = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT);
    if (this.tab === 'home')
      this.set(
        'hsub',
        [
          this.fmtEn.dateLong(new Date()),
          avg == null ? '' : `${avg.toFixed(1)}° inside`,
          out == null ? '' : `${f1(out)}° outside`,
          att.items.length
            ? plural(att.items.length, 'item') + (att.items.length === 1 ? ' needs' : ' need') + ' attention'
            : '',
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
    if (this.tab === 'cams') {
      const cams = this.cameras(),
        X = this.sensors(),
        doors = X.filter(x => x.kind === 'door'),
        open = doors.filter(x => isOn(x.id)).length,
        motion = X.filter(x => x.kind === 'motion' && isOn(x.id)).length;
      this.set(
        'cmsub',
        [
          cams.length ? plural(cams.length, 'camera') : 'No cameras',
          doors.length ? (open ? plural(open, 'door') + ' open' : 'all doors closed') : '',
          motion ? 'motion now' : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
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
    const L = this.live(),
      isOn = i => (this.st(i) || {}).state === 'on',
      H = this.H;
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
    const temps = L.rooms.map(r => r.t).filter(v => v != null),
      avg = temps.length ? sum(temps) / temps.length : null,
      nHeat = L.rooms.filter(r => r.heating).length;
    const hp = this.st(this.E.hp),
      hpTxt = !ok(hp) ? 'offline' : hp.state === 'off' ? 'off' : hp.attributes.hvac_action || hp.state;
    const c = this.car ? this.carState() : null,
      P = this.purifiers(),
      air = P.rooms.length ? this.airSummary(P) : null,
      ri = this.rateInfo();
    const whT = this.num(this.E.whT),
      whP = this.kw(this.E.whP),
      wh24 = H && H.wh24 ? sum(H.wh24.p.filter(x => x[0] >= Date.now() - 864e5).map(x => x[1])) / 12 : null;
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
        `Now${H ? ` · ${f1(H.totals.today)} kWh today` : ''} · ${esc(ri.short)}`,
      ],
      [
        'air',
        'aq',
        'var(--ok)',
        'Air',
        !air ? '–' : air.worst < 0 ? 'No data' : AQ_LVL[air.worst][0],
        !air
          ? 'No purifiers'
          : `${plural(P.rooms.length, 'purifier')}${air.worst > 0 ? ' · ' + esc(air.why) : ' · clean air everywhere'}`,
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
    // on a phone a tile opens its sheet straight away; Lights goes to its section, the water heater opens its card
    const PH = {
      climate: 'data-csel="house"',
      car: 'data-opens="sh-car"',
      energy: 'data-opens="sh-energy"',
      air: 'data-opens="sh-air"',
    };
    const extra = (k, i) =>
      !this.compact
        ? ''
        : i === 'drop'
          ? 'data-card="water" data-title="Water heater" data-icon="drop" data-color="var(--c-wh)"'
          : PH[k] || '';
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
    const X = this.sensors();
    const cams = this.cameras(),
      stamp = Math.floor(Date.now() / 10000),
      doors = X.filter(x => x.kind === 'door'),
      open = doors.filter(x => isOn(x.id)).length,
      moving = X.filter(x => x.kind === 'motion' && isOn(x.id)).length;
    const secSum = [
      cams.length ? plural(cams.length, 'camera') : '',
      doors.length ? (open ? plural(open, 'door') + ' open' : 'all doors closed') : '',
      moving ? 'motion now' : 'no motion',
    ]
      .filter(Boolean)
      .join(' · ');
    this.set(
      'hsec',
      `<button type="button" class="hh" data-pane="cams"><span class="hsecico"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7.5 3.2v5.3c0 4.8-3.2 9-7.5 10.6-4.3-1.6-7.5-5.8-7.5-10.6V5.7z" fill="var(--m-sage)"/><path d="M8.8 12.2l2.2 2.2 4.4-4.4" fill="none" stroke="var(--card)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="lbl">Security</span><span class="right">${esc(secSum)}</span><span class="go">›</span></button>
      ${
        cams.length
          ? `<div class="hcams">${cams
              .slice(0, 4)
              .map(c => {
                const cs = this.st(c.id),
                  pic = cs && cs.attributes.entity_picture,
                  m = c.motion,
                  mv = m && m.state === 'on';
                return `<button type="button" class="hcam" data-cam="${esc(c.id)}" aria-description="Opens the live view">${ok(cs) && pic ? `<img src="${esc(pic)}&t=${stamp}" alt="" loading="lazy">` : `<span class="camoff">${ico('cam', 24)}</span>`}<span class="hcn">${esc(c.name)}${mv ? ' <b>· motion</b>' : ''}</span></button>`;
              })
              .join('')}</div>`
          : ''
      }
      ${
        X.length
          ? `<div class="hsens">${X.map(x => {
              const S = this.sensorState(x);
              return `<button type="button" class="hsen" data-sens="${esc(x.id)}" aria-description="Opens the history"><span class="sic">${ico(x.kind === 'door' ? 'door' : 'walk', 20)}</span><div><b>${esc(x.name)}</b><span class="${S.cls}">${esc(S.main)}${S.sub ? ` <small>· ${esc(S.sub)}</small>` : ''}</span></div></button>`;
            }).join('')}</div>`
          : '<p class="hint">No door or motion sensors yet.</p>'
      }`,
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
    const defi = this.st(this.E.defi);
    if (ok(defi) && defi.state !== 'off') out.push(['Hilo', `Challenge: ${esc(defi.state)}`]);
    const pk = this.st(this.E.hqUpcoming);
    if (pk && pk.state === 'on') out.push(['Hydro-Québec', 'Critical peak coming']);
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
  // ---------- energy Sankey: grid, then the four groups, then the rooms that heat ----------
  sankeyData() {
    const m = this.smode || 'now',
      H = this.H;
    if (m === 'now') {
      const L = this.live();
      return {
        fmt: v => (v < 1 ? Math.round(v * 1000) + ' W' : v.toFixed(2) + ' kW'),
        total: L.grid,
        parts: [L.heat, L.wh, L.ev, L.rest],
        rooms: L.rooms.map(r => r.p),
        note: "Live power: the Hilo meter on the left, each device's own sensor on the right.",
      };
    }
    if (!H) return null;
    if (m === 'today') {
      const d = H.daily[H.daily.length - 1];
      if (!d || d.day !== this.fmtEn.isoDay(Date.now())) return null;
      return {
        fmt: v => v.toFixed(1) + ' kWh',
        total: d.total,
        parts: [d.heat, d.wh, d.ev, d.rest],
        rooms: d.rooms,
        note: `Energy since midnight, ${f1(d.total)} kWh so far.`,
      };
    }
    const total = sum(H.g30);
    return {
      fmt: v => Math.round(v) + ' kWh',
      total,
      parts: H.g30,
      rooms: H.room30,
      note: `Last 30 days, ${Math.round(total)} kWh in all.`,
    };
  }
  renderSankey() {
    const el = this.$('sankey');
    if (!el) return;
    this.root
      .querySelectorAll('#stabs .tab')
      .forEach(t => t.setAttribute('aria-selected', t.dataset.s === (this.smode || 'now')));
    const D = this.sankeyData(),
      s = this.S();
    if (!D || D.total == null || D.total <= 0) {
      this.set('skp', 'No data yet.');
      this.set('sankey', '<p class="loading">No data yet</p>');
      return;
    }
    this.set('skp', D.note);
    if ((this.smode || 'now') === 'now') {
      this.set('sankey', this.flowSvg());
      return;
    }
    const H = 300,
      NW = 20,
      GAP = 12,
      X = [0, 400, 800],
      groups = this.groups(s)
        .map(([c, n], i) => ({n, c, v: Math.max(0, D.parts[i] || 0)}))
        .filter(g => g.v > 0);
    const total = Math.max(D.total, sum(groups.map(g => g.v))),
      k = (H - GAP * (groups.length - 1)) / total,
      top = 24;
    // rooms with their share of the heating; small ones are gathered
    let rooms = this.ROOMS.map((r, i) => ({n: this.roomName(r), v: D.rooms[i] || 0}))
      .filter(r => r.v > 0)
      .sort((a, b) => b.v - a.v);
    const heat = groups.find(g => g.n === 'Room heating'),
      small = rooms.filter(r => r.v < 0.03 * (heat ? heat.v : 1));
    if (small.length > 1)
      rooms = [...rooms.filter(r => !small.includes(r)), {n: 'Other rooms', v: sum(small.map(r => r.v))}];
    if (!heat) rooms = [];
    const kr = rooms.length
      ? Math.min(k, (H - GAP * (rooms.length - 1)) / Math.max(heat.v, sum(rooms.map(r => r.v))))
      : k;
    const rib = (x0, a0, a1, x1, b0, b1, c) => {
      const xm = (x0 + x1) / 2;
      return `<path d="M${x0},${a0.toFixed(1)} C${xm},${a0.toFixed(1)} ${xm},${b0.toFixed(1)} ${x1},${b0.toFixed(1)} L${x1},${b1.toFixed(1)} C${xm},${b1.toFixed(1)} ${xm},${a1.toFixed(1)} ${x0},${a1.toFixed(1)} Z" fill="${c}" opacity=".45"/>`;
    };
    const node = (x, y, h, c) =>
      `<rect x="${x}" y="${y.toFixed(1)}" width="${NW}" height="${Math.max(2, h).toFixed(1)}" rx="4" fill="${c}"/>`;
    const label = (x, y, n, v, anchor = 'start') =>
      `<text x="${x}" y="${(y - 3).toFixed(1)}" text-anchor="${anchor}">${esc(n)}</text><text x="${x}" y="${(y + 13).toFixed(1)}" text-anchor="${anchor}" class="v">${D.fmt(v)}</text>`;
    let out = '',
      gy = top,
      ly = top + (H - total * k) / 2;
    out += node(X[0], ly, total * k, s.rest) + label(X[0] + NW + 8, top - 6 + 10, 'Grid', D.total);
    let ry = top + (H - (sum(rooms.map(r => r.v)) * kr + GAP * (rooms.length - 1))) / 2,
      hy = 0;
    groups.forEach(g => {
      const h = g.v * k;
      out +=
        rib(X[0] + NW, ly, ly + h, X[1], gy, gy + h, g.c) +
        node(X[1], gy, h, g.c) +
        label(X[1] + NW + 8, gy + h / 2, g.n, g.v);
      if (g === heat) hy = gy;
      ly += h;
      gy += h + GAP;
    });
    rooms.forEach(r => {
      const h = r.v * kr,
        hs = r.v * k;
      out +=
        rib(X[1] + NW, hy, hy + hs, X[2], ry, ry + h, s.heat) +
        node(X[2], ry, h, s.heat) +
        label(X[2] + NW + 8, ry + h / 2, r.n, r.v);
      hy += hs;
      ry += h + GAP;
    });
    this.set(
      'sankey',
      `<svg class="sk" viewBox="0 0 980 ${H + top + 8}" role="img" aria-label="Power from the grid, split into room heating, water heating, EV charging and the rest of the home">${out}</svg>`,
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
  openCamera(id) {
    const s = this.st(id);
    if (!s) return;
    this.camId = id;
    this.sheets.open('sh-cam');
  }
  camSheet() {
    const id = this.camId,
      s = this.st(id),
      c = this.cameras().find(x => x.id === id) || {name: this.name(id)};
    this.$('camh').textContent = c.name;
    this.$('camsub').textContent = [
      ok(s) ? cap(s.state) : 'Offline',
      c.motion && ok(c.motion)
        ? c.motion.state === 'on'
          ? 'motion now'
          : 'last motion ' + this.ago(c.motion.last_changed)
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const box = this.$('camlive');
    box.innerHTML = '';
    if (!ok(s)) {
      box.innerHTML = '<p>The camera is offline.</p>';
      return;
    }
    // HA's own player (WebRTC or HLS) when the frontend has it loaded, else the MJPEG proxy
    if (customElements.get('ha-camera-stream')) {
      const v = document.createElement('ha-camera-stream');
      v.hass = this.hass;
      v.stateObj = s;
      v.muted = true;
      v.controls = true;
      v.allowExoPlayer = true;
      box.appendChild(v);
      this.camEl = v;
    } else {
      const img = document.createElement('img');
      img.alt = c.name + ' live';
      img.src = `/api/camera_proxy_stream/${id}?token=${encodeURIComponent(s.attributes.access_token || '')}`;
      box.appendChild(img);
      this.camEl = img;
    }
  }

  // ---------- attention, folded into the status chip ----------
  toggleAttention(force) {
    const pop = this.$('attpop'),
      open = force ?? pop.hidden;
    pop.hidden = !open;
    const b = this.root.querySelector('#chips .attchip');
    if (b) b.setAttribute('aria-expanded', open);
    if (open) this.renderAttention();
  }

  // ---------- sensor history: a door or motion sensor, Day / Week ----------
  openSens(id) {
    const x = this.sensors().find(s => s.id === id);
    if (!x) return;
    this.sensX = x;
    this.sensRange = this.sensRange || 'day';
    this.sheets.open('sh-sens');
  }
  // door or motion sensor: an on/off strip over the period, the list of events, and totals
  async sensSheet() {
    const x = this.sensX,
      r = this.sensRange,
      R = CRANGE[r],
      door = x.kind === 'door';
    this.$('sensh').textContent = x.name;
    this.$('senssub').textContent = door ? 'Door' : 'Motion';
    this.$('sensbadge').innerHTML = ico(door ? 'door' : 'walk', 26);
    this.$('sensbadge').style.setProperty('--acc', door ? 'var(--t-warn)' : 'var(--t-home)');
    this.root.querySelectorAll('#senstabs .tab').forEach(t => t.setAttribute('aria-selected', t.dataset.r === r));
    this.$('senst').textContent = `${x.name}, ${R.label}`;
    const now = Date.now(),
      t0 = now - R.days * 864e5;
    let h;
    try {
      h = await this.api.history([x.id], new Date(t0), {minimal: true, attributes: false});
    } catch (e) {
      if (e instanceof StaleReply) return;
      console.error('home-panel sensor history', e);
      this.$('sensbody').innerHTML = '<p>History is not available right now.</p>';
      this.$('sensstats').innerHTML = '';
      return;
    }
    // the sheet may have moved on while the history was on its way: another sensor, another range, or closed (a config
    // change is the StaleReply above). Known edge: taps A, B, A let A's first reply draw until its second repaints the
    // same sensor and range.
    if (!this.sheets.isOpen('sh-sens') || this.sensX !== x || this.sensRange !== r) return;
    const segs = [];
    /** @type {{a: number, b?: number, live?: boolean} | null} */
    let cur = null;
    (h[x.id] || []).forEach(y => {
      const t = y.lastUpdated;
      if (y.state === 'on' && !cur) cur = {a: Math.max(t, t0)};
      else if (y.state !== 'on' && cur) {
        cur.b = t;
        segs.push(cur);
        cur = null;
      }
    });
    if (cur) {
      cur.b = now;
      cur.live = true;
      segs.push(cur);
    }
    const dur = ms =>
      ms < 6e4
        ? `${Math.max(1, Math.round(ms / 1e3))} s`
        : ms < 36e5
          ? `${Math.round(ms / 6e4)} min`
          : `${Math.floor(ms / 36e5)} h ${Math.round(ms / 6e4) % 60} min`;
    const pct = t => ((t - t0) / (now - t0)) * 100,
      when = t => (r === 'day' ? this.fmtEn.time(t) : `${this.fmtEn.date(t)} ${this.fmtEn.time(t)}`);
    const n = r === 'day' ? 4 : 7,
      axis = Array.from({length: n + 1}, (_, i) => {
        const t = t0 + ((now - t0) * i) / n;
        return `<span>${r === 'day' ? this.fmtEn.time(t) : this.fmtEn.date(t)}</span>`;
      }).join('');
    const evs = segs
      .slice()
      .reverse()
      .slice(0, 40)
      .map(
        s =>
          `<li><b>${when(s.a)}</b><span>${s.live ? (door ? 'Still open' : 'Motion now') : `${door ? 'Open for' : 'Motion for'} ${dur(s.b - s.a)}`}</span></li>`,
      )
      .join('');
    this.$('sensbody').innerHTML =
      `<div class="sstrip" style="--acc:${door ? 'var(--t-warn)' : 'var(--t-home)'}" role="img" aria-label="${door ? 'Open' : 'Motion'} periods">${segs.map(s => `<i style="left:${pct(s.a).toFixed(2)}%;width:${Math.max(0.35, pct(s.b) - pct(s.a)).toFixed(2)}%"></i>`).join('')}</div><div class="saxis">${axis}</div>${evs ? `<ul class="sevents">${evs}</ul>` : `<p class="hint">${door ? 'Not opened in this period' : 'No motion in this period'}</p>`}`;
    const total = segs.reduce((a, s) => a + s.b - s.a, 0),
      longest = segs.reduce((a, s) => Math.max(a, s.b - s.a), 0),
      last = segs[segs.length - 1];
    this.$('sensstats').innerHTML = [
      [door ? 'Times opened' : 'Motion events', segs.length, ''],
      [door ? 'Total open' : 'Total motion', segs.length ? dur(total) : '–', ''],
      ['Longest', segs.length ? dur(longest) : '–', ''],
      ['Last', last ? this.ago(new Date(last.live ? last.a : last.b).toISOString()) : '–', ''],
    ]
      .map(tile)
      .join('');
  }
  // ---------- climate sheet ----------
  climateSummary() {
    const L = this.live(),
      temps = L.rooms.map(r => r.t).filter(v => v != null),
      out = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT);
    const heating = L.rooms.filter(r => r.heating);
    const hp = L.hp,
      hpTxt = !this.E.hp
        ? ''
        : !ok(hp)
          ? 'heat pump offline'
          : hp.state === 'off'
            ? 'heat pump off'
            : `heat pump ${hp.attributes.hvac_action || hp.state}${hp.attributes.temperature != null ? ' to ' + hp.attributes.temperature + '°' : ''}`;
    // short on purpose: the room list sits right under it
    return [
      temps.length ? `${(sum(temps) / temps.length).toFixed(1)}° average inside` : '',
      out != null ? `${f1(out)}° outside` : '',
      heating.length ? plural(heating.length, 'room') + ' heating' : 'no rooms heating',
      hpTxt,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  renderClimateList() {
    const items = this.climItems();
    this.set(
      'clist',
      items
        .map(
          i =>
            `<button class="citem ${i.cls}" role="option" type="button" data-id="${i.id}" aria-selected="${i.id === this.climSel}"><span class="ic">${ico(i.icon)}</span><span class="tx"><div class="nm">${esc(i.nm)}</div><div class="sb">${esc(i.sb)}</div></span><span class="tv">${i.tv}</span></button>`,
        )
        .join(''),
    );
  }
  gauge(t, sp) {
    if (t == null) return '';
    const pos = v => Math.max(0, Math.min(100, ((v - 14) / 16) * 100)),
      spOn = sp != null && sp >= 14;
    return `<div class="gauge" role="img" aria-label="Temperature ${t.toFixed(1)} degrees${spOn ? ', setpoint ' + sp + ' degrees' : ''} on a 14 to 30 degree scale">${spOn ? `<span class="sp" style="left:${pos(sp)}%"></span>` : ''}<span class="mk" style="left:${pos(t)}%"></span><span class="lb" style="left:${pos(t)}%">Now ${t.toFixed(1)}°</span></div>
      <div class="gscale"><span>14°</span><span>${spOn ? 'Bar marks the setpoint' : sp != null ? 'Thermostat off (5° frost guard)' : ''}</span><span>30°</span></div>`;
  }
  // ---------- climate history by range ----------
  async loadClimRange(r) {
    const c = this.CR[r];
    if (c && Date.now() - c.at < 10 * 60000) return c;
    const R = CRANGE[r],
      start = new Date(Date.now() - R.days * 864e5),
      ids = [
        ...this.ROOMS.map(x => x.temp),
        ...this.ROOMS.map(x => x.target),
        ...this.ROOMS.map(x => x.power),
        this.E.outT,
      ];
    const [stt, hp] = await Promise.all([
      this.api.statistics(ids, R.period, start, ['mean', 'min', 'max']),
      !this.E.hp
        ? Promise.resolve({})
        : this.api.history([this.E.hp], start, {minimal: false, attributes: true}).catch(noHistory),
    ]);
    const ser = id =>
      (stt[id] || [])
        .filter(x => x.mean != null)
        .map(x => [
          ms(x.start) + R.mid,
          +(+x.mean).toFixed(2),
          x.min == null ? null : +(+x.min).toFixed(2),
          x.max == null ? null : +(+x.max).toFixed(2),
        ]);
    // setpoints: a stretch that was partly off shows its highest setpoint, one off throughout is a gap (5° is Hilo's frost guard)
    const spSer = id =>
      (stt[id] || [])
        .filter(x => x.max != null)
        .map(x => [
          ms(x.start) + R.mid,
          x.max <= 5.5 ? null : +(x.min > 5.5 && x.mean != null ? +x.mean : +x.max).toFixed(2),
        ]);
    // heating energy over the range: mean kW of each stat period x its hours (the running period counts only the hours so far)
    const ph = R.period === '5minute' ? 1 / 12 : R.period === 'hour' ? 1 : 24,
      now = Date.now();
    const kwhOf = id =>
      sum(
        (stt[id] || [])
          .filter(x => x.mean != null)
          .map(x => x.mean * Math.max(0, Math.min(ph, (now - ms(x.start)) / 36e5))),
      );
    const rooms = {},
      sp = {},
      kwh = {};
    this.ROOMS.forEach(x => {
      rooms[x.k] = ser(x.temp);
      sp[x.k] = spSer(x.target);
      kwh[x.k] = kwhOf(x.power);
    });
    const hpPts = hpSeries(hp && hp[this.E.hp]),
      hpSp = hpSeries(hp && hp[this.E.hp], (a, m) => (['off', 'fan_only', 'dry'].includes(m) ? null : a.temperature));
    return (this.CR[r] = {
      at: Date.now(),
      start: start.getTime(),
      rooms,
      sp,
      kwh,
      out: ser(this.E.outT),
      hp: hpPts,
      hpSp,
      hpFrom: hpPts.length ? hpPts[0][0] : null,
    });
  }
  houseSeries(C) {
    const by = new Map();
    this.ROOMS.forEach(r =>
      (C.rooms[r.k] || []).forEach(([x, v]) => {
        const a = by.get(x) || [];
        a.push(v);
        by.set(x, a);
      }),
    );
    return [...by]
      .filter(([, v]) => v.length === this.ROOMS.length)
      .sort((a, b) => a[0] - b[0])
      .map(([x, v]) => [x, +(sum(v) / v.length).toFixed(2)]);
  }
  async climateSheet() {
    if (!this.ApexCharts) return; // a tap while the chunk is loading; buildSheet draws it when it lands
    this.$('csub').textContent = this.climateSummary();
    this.root
      .querySelectorAll('#ctabs .tab')
      .forEach(t => t.setAttribute('aria-selected', t.dataset.r === this.crange));
    this.cache.clist = null;
    this.renderClimateList();
    this.climateDetail();
    const r = this.crange,
      tag = (this.climTag = Symbol());
    this.$('cheath').textContent = CRANGE[r].heatTitle;
    this.$('couth').textContent = `Outside, ${CRANGE[r].label}`;
    let C;
    try {
      C = await this.loadClimRange(r);
    } catch (e) {
      if (e instanceof StaleReply) return;
      console.error('home-panel climate history', e);
      this.$('c-heat').innerHTML = '<p>History is not available right now.</p>';
      return;
    }
    if (tag !== this.climTag || !this.sheets.isOpen('sh-climate')) return;
    this.charts = this.charts.filter(c => {
      if (c.__clim) {
        try {
          c.destroy();
        } catch {}
        return false;
      }
      return true;
    });
    this.climateDetail();
    if (this.compact) return; // the phone sheet is one room: no heatmap, no outside chart
    const s = this.S(),
      R = CRANGE[r],
      dark = this.dark();
    const stops = dark ? HEAT_DARK : HEAT_LIGHT;
    this.$('cheatl').innerHTML =
      `<span class="hbar" style="background:linear-gradient(90deg,${Array.from({length: 19}, (_, i) => heatColor(HEAT_LO + i / 2, stops)).join(',')})"></span><span class="hticks">${[17, 19, 21, 23, 25].map(t => `<i style="left:${((t - HEAT_LO) / (HEAT_HI - HEAT_LO)) * 100}%">${t}°</i>`).join('')}</span>`;
    const series = [...this.ROOMS].reverse().map(x => ({
      name: this.roomName(x),
      data: this.bucket(C.rooms[x.k] || [], r).map(([k, lbl, v]) => ({x: lbl, y: v, k})),
    }));
    const cats = (series[0] || {data: []}).data.map(p => p.x);
    // a house without thermostats has no heatmap to draw (ApexCharts throws on an empty heatmap)
    if (!series.length) this.$('c-heat').innerHTML = '<p class="hint">No thermostats found.</p>';
    else {
      const h = this.mk(
        'c-heat',
        merge(
          this.base(300),
          {
            chart: {type: 'heatmap'},
            series,
            plotOptions: {
              heatmap: {
                radius: r === 'week' || r === 'year' ? 2 : 4,
                enableShades: false,
                colorScale: {ranges: heatRanges(stops)},
              },
            },
            stroke: {width: r === 'week' || r === 'year' ? 1 : 2, colors: [s.card]},
            legend: {show: false},
            tooltip: {y: {formatter: v => (v == null ? '–' : v.toFixed(1) + ' °C')}},
          },
          this.thin(cats, 4, R.ticks),
          r === 'week'
            ? {xaxis: {labels: {formatter: v => (/ night$/.test(v || '') ? v.split(',')[0] : '')}}}
            : r === 'day'
              ? {
                  xaxis: {
                    labels: {
                      formatter: (() => {
                        const keep = new Set(cats.filter((c, i) => i % (this.$app.clientWidth < 600 ? 6 : 3) === 0));
                        return x => (keep.has(x) ? x.split(', ')[1] : '');
                      })(),
                    },
                  },
                }
              : {},
        ),
      );
      h.__clim = true;
    }
    const band = C.out.filter(p => p[2] != null && p[3] != null);
    const o = this.mk(
      'c-out90',
      merge(this.base(260), {
        chart: {type: 'rangeArea'},
        series: [
          {name: 'Low to high', type: 'rangeArea', data: band.map(p => ({x: p[0], y: [p[2], p[3]]}))},
          {name: R.meanName, type: 'line', data: C.out.map(p => ({x: p[0], y: p[1]}))},
        ],
        colors: [s.home, s.home],
        fill: {opacity: [0.22, 1]},
        stroke: {width: [0, 2], curve: 'smooth'},
        xaxis: {type: 'datetime', min: C.start, max: Date.now(), labels: {datetimeUTC: false}},
        yaxis: {labels: {formatter: v => v.toFixed(0) + '°'}},
        tooltip: {
          shared: true,
          x: {format: R.tipFmt},
          y: {
            formatter: v =>
              Array.isArray(v) ? v.map(n => (+n).toFixed(1)).join(' to ') + ' °C' : (+v).toFixed(1) + ' °C',
          },
        },
      }),
    );
    o.__clim = true;
    this.$('coutp').textContent = R.outNote;
  }
  climInfo() {
    const L = this.live();
    const C = this.CR[this.crange],
      R = CRANGE[this.crange],
      rng = pts => {
        const v = pts.map(p => p[1]).filter(x => x != null);
        return v.length ? `${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)}` : '–';
      };
    let pts = [],
      title,
      sub,
      t,
      sp = null,
      pill,
      tiles,
      note = '';
    if (this.climSel === 'hp') {
      const hp = L.hp,
        a = ok(hp) ? hp.attributes : {};
      title = 'Heat pump';
      sub = this.hpBrand() === 'Fujitsu' ? 'Fujitsu, through the FGLair integration' : this.hpBrand();
      t = a.current_temperature != null ? +a.current_temperature : null;
      sp = hp && hp.state !== 'off' ? a.temperature : null;
      pill = `<span class="pill ${L.hpOn ? 'on' : !ok(hp) ? 'bad' : ''}">${!ok(hp) ? 'Offline' : hp.state === 'off' ? 'Off' : `${cap(a.hvac_action || hp.state)}${sp != null ? ' to ' + sp + '°' : ''}`}</span>`;
      pts = C ? C.hp : [];
      tiles = [
        ['Range, ' + R.short, rng(pts), '°'],
        ['Last update', ok(hp) ? this.fmtEn.time(new Date(hp.last_updated)) : '–', ''],
      ];
      note =
        'Readings come from the unit itself. A break in the line means the integration was offline. The unit has no power sensor, so its electricity is counted in Rest of home.';
      if (C && C.hpFrom && C.hpFrom > C.start + 864e5)
        note += ` Home Assistant keeps about 10 days of detailed history, so the heat pump line starts ${this.fmtEn.date(C.hpFrom)}.`;
    } else if (this.climSel === 'house') {
      title = 'Whole house';
      sub = `Average of ${this.ROOMS.length} rooms`;
      const ts = L.rooms.filter(r => r.t != null),
        sorted = [...ts].sort((a, b) => b.t - a.t);
      t = ts.length ? sum(ts.map(r => r.t)) / ts.length : null;
      const n = L.rooms.filter(r => r.heating).length;
      pill = `<span class="pill ${n || L.hpOn ? 'on' : ''}">${L.hpOn ? 'Heat pump + ' : ''}${plural(n, 'room')} heating</span>`;
      tiles = [
        ['Warmest', sorted.length ? f1(sorted[0].t) : '–', '°', sorted.length ? sorted[0].name : ''],
        [
          'Coolest',
          sorted.length ? f1(sorted[sorted.length - 1].t) : '–',
          '°',
          sorted.length ? sorted[sorted.length - 1].name : '',
        ],
        ['Heating now', L.heat.toFixed(2), 'kW', 'all thermostats'],
        ['Heating, ' + R.short, C ? Math.round(sum(Object.values(C.kwh))) : '–', 'kWh', 'all thermostats'],
      ];
      pts = C ? this.houseSeries(C) : [];
    } else {
      const i = this.ROOMS.findIndex(r => r.k === this.climSel),
        r = L.rooms[i];
      title = r.name;
      sub = 'Hilo thermostat';
      t = r.t;
      sp = r.sp;
      pill = `<span class="pill ${r.heating ? 'on' : !r.ok ? 'bad' : ''}">${!r.ok ? 'Unavailable' : r.heating ? `Heating to ${sp}°` : sp > 5.5 ? `Holding ${sp}°` : 'Off'}</span>`;
      pts = C ? (C.rooms[r.k] || []).map(p => [p[0], p[1]]) : [];
      tiles = [
        ['Range, ' + R.short, rng(pts), '°'],
        ['Drawing now', r.p.toFixed(2), 'kW'],
        ['Heating, ' + R.short, C ? C.kwh[r.k].toFixed(1) : '–', 'kWh'],
      ];
      note = 'The dashed line is the setpoint. Where it stops, the thermostat was off.';
    }
    return {C, R, pts, title, sub, t, sp, pill, tiles, note};
  }
  // the top of the detail (temperature, state, gauge, tiles) follows live states; the chart only redraws on a new selection or range
  renderClimateHead(force) {
    if (!this.$('chead') || (this.dialDrag && !force)) return;
    const fresh = !this.$('chead').firstChild; // the sheet just opened or changed room: the dial draws itself in (motion.css)
    const {title, sub, t, sp, pill, tiles} = this.climInfo(),
      out = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT);
    if (this.compact) {
      // phone: an Apple Home style dial instead of the big number and the bar
      let d;
      if (this.climSel === 'house') d = {sp: undefined, lo: 5, hi: 30, ed: false, state: `${f1(t)}° average`};
      else if (this.climSel === 'hp') {
        const hp = this.st(this.E.hp),
          a = ok(hp) ? hp.attributes : {};
        const mode = this.pend('hp:mode', hp && hp.state);
        d = {
          sp: !ok(hp) || ['off', 'fan_only', 'dry'].includes(mode) ? null : +this.pend('hp:sp', a.temperature),
          lo: a.min_temp ?? 16,
          hi: a.max_temp ?? 30,
          ed: ok(hp) && !['off', 'fan_only', 'dry'].includes(mode),
          state: pill.replace(/<[^>]+>/g, ''),
        };
      } else {
        const r = this.ROOMS.find(x => x.k === this.climSel),
          c = this.st(r.climate),
          a = ok(c) ? c.attributes : {};
        d = {
          sp: ok(c) ? +this.pend(r.climate, a.temperature) : null,
          lo: a.min_temp ?? 5,
          hi: a.max_temp ?? 30,
          ed: ok(c),
          state: pill.replace(/<[^>]+>/g, ''),
        };
      }
      this.set(
        'chead',
        `<div class="big"><div><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>${pill}</div>${this.dial(t, d.sp, d.lo, d.hi, d.ed, `${t != null ? 'Now ' + f1(t) + '°' : ''}${out != null ? ' · Outside ' + f1(out) + '°' : ''}`)}`,
      );
      if (fresh) {
        const d = this.$('chead').querySelector('.dial');
        if (d) d.classList.add('in');
      }
    } else
      this.set(
        'chead',
        `<div class="big"><div><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>${pill}</div>
      <div class="big" style="margin-top:4px"><div class="t">${f1(t)}<small>°C</small></div><div class="muted" style="font-size:13px;padding-bottom:6px">Outside ${f1(out)}°</div></div>
      ${this.gauge(t, this.climSel === 'house' ? null : sp)}`,
      );
    // on a phone the range ("18.5–23.0°") gets a row of its own so it isn't cut off
    this.set(
      'ctiles',
      tiles
        .map((x, i) =>
          i === 0 && /^Range/.test(x[0]) ? tile(x).replace('class="tile"', 'class="tile trange"') : tile(x),
        )
        .join(''),
    );
    this.$('ctiles').style.gridTemplateColumns = `repeat(${tiles.length},minmax(0,1fr))`;
  }
  climateDetail() {
    if (this.climChart) {
      this.climChart.destroy();
      this.charts = this.charts.filter(c => c !== this.climChart);
      this.climChart = null;
    }
    const s = this.S(),
      el = this.$('cdet'),
      {C, R, pts, title, note} = this.climInfo(),
      spc = this.css('--fg2');
    // the thermostat's setpoint, stepped and dashed, for a room or the heat pump
    const spPts =
        !C || this.climSel === 'house' ? [] : this.climSel === 'hp' ? C.hpSp || [] : (C.sp || {})[this.climSel] || [],
      hasSp = spPts.some(p => p[1] != null);
    el.innerHTML = `<div id="chead"></div><div id="cctl" class="cctl"></div><div class="tiles" id="ctiles"></div>
      <div class="legend"><span><b style="background:${s.wh}"></b>${this.climSel === 'house' ? 'House average' : esc(title)}</span>${this.climSel === 'house' ? '' : `<span><b class="dash" style="color:${spc}"></b>Setpoint</span>`}<span><b style="background:${s.home}"></b>Outside</span><span class="muted">${esc(R.label)}</span></div><div id="c-room">${C ? '' : '<p class="loading">Loading history…</p>'}</div>${note ? `<p class="note">${note}</p>` : ''}`;
    this.cache.chead = this.cache.ctiles = this.cache.cctl = null;
    this.renderClimateHead();
    this.renderClimateControls();
    if (!C || !this.ApexCharts) return;
    // apex splits 'smooth' lines into pieces once any series has a gap, so with a setpoint the room lines use monotoneCubic instead
    const cv = this.climSel === 'hp' ? 'straight' : hasSp ? 'monotoneCubic' : 'smooth';
    this.climChart = this.mk(
      'c-room',
      merge(this.base(230), {
        chart: {type: 'line'},
        series: [
          {name: this.climSel === 'house' ? 'House average' : title, data: pts},
          ...(hasSp ? [{name: 'Setpoint', data: spPts}] : []),
          {name: 'Outside', data: C.out.map(p => [p[0], p[1]])},
        ],
        colors: [s.wh, ...(hasSp ? [spc] : []), s.home],
        stroke: hasSp
          ? {width: [2.2, 2, 2.2], curve: [cv, 'stepline', cv], dashArray: [0, 5, 0]}
          : {width: 2.2, curve: cv},
        xaxis: {type: 'datetime', min: C.start, max: Date.now(), labels: {datetimeUTC: false}},
        yaxis: {labels: {formatter: v => (v == null ? '' : v.toFixed(0) + '°')}},
        tooltip: {shared: true, x: {format: R.tipFmt}, y: {formatter: v => (v == null ? '–' : v.toFixed(1) + ' °C')}},
      }),
    );
  }

  // ---------- climate controls ----------
  pend(key, cur) {
    const p = this.pending[key];
    if (p && p.until > Date.now() && String(p.v) !== String(cur)) return p.v;
    if (p) delete this.pending[key];
    return cur;
  }
  renderClimateControls() {
    const el = this.$('cctl');
    if (!el) return;
    const stepper = (k, v, lo, hi, label, off) => `<div class="stepper" role="group" aria-label="${esc(label)}">
        <button type="button" data-c="${k}" data-d="-0.5" aria-label="Lower ${esc(label.toLowerCase())}" ${v == null || v <= lo ? 'disabled' : ''}>−</button>
        <div class="sv"><b class="num">${v == null ? '–' : off ? 'Off' : (+v).toFixed(1) + '°'}</b><small>${esc(label)}</small></div>
        <button type="button" data-c="${k}" data-d="0.5" aria-label="Raise ${esc(label.toLowerCase())}" ${v == null || v >= hi ? 'disabled' : ''}>+</button></div>`;
    const seg = (k, opts, cur, aria) =>
      `<div class="seg" role="radiogroup" aria-label="${esc(aria)}">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-c="${k}" data-v="${esc(v)}"><b>${esc(l)}</b></button>`).join('')}</div>`;
    let html = '';
    if (this.climSel === 'hp') {
      const hp = this.st(this.E.hp);
      if (!ok(hp)) {
        html = '<p class="muted">The heat pump is offline, so it can\'t be adjusted right now.</p>';
      } else {
        const a = hp.attributes,
          mode = this.pend('hp:mode', hp.state),
          spv = this.pend('hp:sp', a.temperature),
          fan = this.pend('hp:fan', a.fan_mode),
          pre = this.pend('hp:preset', a.preset_mode),
          sw = this.pend('hp:swing', a.swing_mode);
        const modes = (a.hvac_modes || ['off', 'heat']).map(m => [m, HVAC[m] || cap(m)]);
        html = `<div class="clbl">Mode</div>${seg('hpmode', modes, mode, 'Heat pump mode')}
          ${['off', 'fan_only', 'dry'].includes(mode) ? '' : `<div class="crow">${stepper('hpsp', spv, a.min_temp ?? 16, a.max_temp ?? 30, 'Target')}</div>`}
          ${
            mode === 'off'
              ? ''
              : `${
                  a.fan_modes
                    ? `<div class="clbl">Fan</div>${seg(
                        'hpfan',
                        a.fan_modes.map(m => [m, cap(m)]),
                        fan,
                        'Fan speed',
                      )}`
                    : ''
                }
          ${
            a.preset_modes
              ? `<div class="clbl">Preset</div>${seg(
                  'hppre',
                  a.preset_modes.map(m => [m, m === 'none' ? 'Normal' : cap(m)]),
                  pre,
                  'Preset',
                )}`
              : ''
          }
          ${a.swing_modes ? `<div class="clbl">Louvers</div><select class="csel" id="hpswing" aria-label="Louver position">${a.swing_modes.map(m => `<option value="${esc(m)}" ${m === sw ? 'selected' : ''}>${esc(swingName(m))}</option>`).join('')}</select>` : ''}`
          }`;
      }
    } else if (this.climSel === 'house') {
      const v = this.allSp ?? 21;
      html = `<div class="clbl">All rooms</div><div class="crow">${stepper('allsp', v, 5.5, 30, 'Set every room to')}
        <button type="button" class="abtn${this.armed === 'allset' ? ' armed' : ''}" data-c="allset">${this.armed === 'allset' ? `Tap again: all ${this.ROOMS.length} rooms to ${v.toFixed(1)}°` : `Set all to ${v.toFixed(1)}°`}</button>
        <button type="button" class="abtn${this.armed === 'alloff' ? ' armed' : ''}" data-c="alloff">${this.armed === 'alloff' ? 'Tap again: all rooms off' : 'All off'}</button></div>
        <p class="hint">Off means the 5° frost guard, the lowest a Hilo thermostat goes. Changes to every room need a second tap.</p>`;
    } else {
      const r = this.ROOMS.find(x => x.k === this.climSel),
        c = this.st(r.climate);
      if (!ok(c)) html = '<p class="muted">This thermostat is unavailable, so it can\'t be adjusted right now.</p>';
      else {
        const a = c.attributes,
          v = this.pend(r.climate, a.temperature),
          off = v <= 5.5;
        html = `<div class="crow">${stepper('roomsp', v, a.min_temp ?? 5, a.max_temp ?? 30, 'Setpoint', off)}
          <div class="quick">${[
            [5, 'Off'],
            [19, '19°'],
            [20, '20°'],
            [21, '21°'],
            [22, '22°'],
          ]
            .map(
              ([q, l]) => `<button type="button" data-c="roomq" data-v="${q}" aria-pressed="${+v === q}">${l}</button>`,
            )
            .join('')}</div></div>`;
      }
    }
    this.set('cctl', html);
  }
  // Apple Home style thermostat dial: a 270° track, ticks, the setpoint knob (draggable) and a dot at the room temperature
  dial(t, sp, lo, hi, ed, sub) {
    const S = 260,
      c = S / 2,
      R = 106,
      a0 = 135,
      sw = 270,
      clamp = v => Math.max(lo, Math.min(hi, v)),
      deg = v => a0 + ((clamp(v) - lo) / (hi - lo)) * sw;
    const pt = (a, r = R) => [c + r * Math.cos((a * Math.PI) / 180), c + r * Math.sin((a * Math.PI) / 180)];
    const arc = (a, b) => {
      if (b - a < 0.5) return '';
      const [x1, y1] = pt(a),
        [x2, y2] = pt(b);
      return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${R} ${R} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    };
    const off = sp == null || sp <= 5.5,
      spv = sp === undefined ? null : off ? lo : clamp(sp);
    const ticks = Array.from({length: 55}, (_, i) => {
      const a = a0 + (i * sw) / 54,
        [x1, y1] = pt(a, R - 17),
        [x2, y2] = pt(a, R - (i % 6 ? 12 : 9));
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${i % 6 ? 1.5 : 2.5}"/>`;
    }).join('');
    const now =
      t == null
        ? ''
        : (([x, y]) => `<circle class="dnow" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`)(pt(deg(t)));
    const knob =
      spv == null
        ? ''
        : (([x, y]) => `<circle class="dknob" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14"/>`)(pt(deg(spv)));
    const big = spv == null ? (t == null ? '–' : f1(t) + '°') : off ? 'Off' : spv.toFixed(1) + '°';
    return `<div class="dial${ed ? ' ed' : ''}" data-lo="${lo}" data-hi="${hi}" role="${ed ? 'slider' : 'img'}" ${ed ? `tabindex="0" aria-valuemin="${lo}" aria-valuemax="${hi}" aria-valuenow="${spv}" aria-valuetext="${off ? 'Off' : spv + ' degrees'}"` : ''} aria-label="${ed ? 'Setpoint' : 'Temperature'}">
      <svg viewBox="0 0 ${S} ${S}" aria-hidden="true"><defs><linearGradient id="dialg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#5B8FD0"/><stop offset=".38" stop-color="#7FB3A0"/><stop offset=".64" stop-color="#E2C07A"/><stop offset="1" stop-color="#D4763F"/></linearGradient></defs>
      <path class="dtrack" d="${arc(a0, a0 + sw)}"/>${spv == null || off ? '' : `<path class="dact" stroke="url(#dialg)" d="${arc(a0, deg(spv))}"/>`}<g class="dticks">${ticks}</g>${now}${knob}</svg>
      <div class="dialc"><b class="num">${big}</b><small>${esc(sub)}</small></div></div>`;
  }
  // the dial's value from a pointer position: the angle from the centre, snapped to half degrees; below the lowest step means off
  dialValue(el, x, y) {
    const r = el.querySelector('svg').getBoundingClientRect(),
      lo = +el.dataset.lo,
      hi = +el.dataset.hi;
    let a = ((Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2)) * 180) / Math.PI - 135 + 720) % 360;
    if (a > 270) a = a > 315 ? 0 : 270;
    const v = Math.round((lo + (a / 270) * (hi - lo)) * 2) / 2;
    return v <= 5.5 ? lo : v;
  }
  // a setpoint from the dial: held locally, sent once the finger rests (same debounce as the stepper taps)
  applySp(v) {
    const hold = (key, val) => {
      this.pending[key] = {v: val, until: Date.now() + 20000};
    };
    const later = (key, fn) => {
      clearTimeout(this.spT && this.spT[key]);
      this.spT = this.spT || {};
      this.spT[key] = setTimeout(fn, 1100);
    };
    if (this.climSel === 'hp') {
      hold('hp:sp', v);
      later('hp', () =>
        this.call(
          'climate',
          'set_temperature',
          {entity_id: this.E.hp, temperature: v},
          `Heat pump set to ${v.toFixed(1)}°`,
        ),
      );
    } else {
      const r = this.ROOMS.find(x => x.k === this.climSel);
      if (!r) return;
      hold(r.climate, v);
      later(r.climate, () =>
        this.call(
          'climate',
          'set_temperature',
          {entity_id: r.climate, temperature: v},
          `${this.roomName(r)} ${v <= 5.5 ? 'off' : 'set to ' + v.toFixed(1) + '°'}`,
        ),
      );
    }
    this.cache.chead = this.cache.cctl = null;
    this.renderClimateHead(true);
    this.renderClimateControls();
  }
  climateControl(e) {
    const b = e.target.closest('[data-c]');
    if (!b || b.disabled) return;
    const k = b.dataset.c,
      hold = (key, v) => {
        this.pending[key] = {v, until: Date.now() + 20000};
      };
    // setpoint taps are collected and sent once the taps stop, so five quick taps are one change
    const later = (key, fn) => {
      clearTimeout(this.spT && this.spT[key]);
      this.spT = this.spT || {};
      this.spT[key] = setTimeout(fn, 1100);
    };
    if (k === 'roomsp' || k === 'roomq') {
      const r = this.ROOMS.find(x => x.k === this.climSel),
        c = this.st(r.climate),
        a = c.attributes,
        lo = a.min_temp ?? 5,
        hi = a.max_temp ?? 30;
      let v = k === 'roomq' ? +b.dataset.v : +this.pend(r.climate, a.temperature) + +b.dataset.d;
      if (k === 'roomsp' && v < 5.5 && +b.dataset.d < 0) v = lo;
      if (k === 'roomsp' && +this.pend(r.climate, a.temperature) <= 5.5 && +b.dataset.d > 0) v = 15;
      v = Math.min(hi, Math.max(lo, Math.round(v * 2) / 2));
      hold(r.climate, v);
      later(r.climate, () =>
        this.call(
          'climate',
          'set_temperature',
          {entity_id: r.climate, temperature: v},
          `${this.roomName(r)} ${v <= 5.5 ? 'off' : 'set to ' + v.toFixed(1) + '°'}`,
        ),
      );
    } else if (k === 'allsp') {
      this.allSp = Math.min(30, Math.max(5.5, (this.allSp ?? 21) + +b.dataset.d));
      this.armed = null;
    } else if (k === 'allset' || k === 'alloff') {
      if (this.armed !== k) {
        this.armed = k;
        clearTimeout(this.armT);
        this.armT = setTimeout(() => {
          this.armed = null;
          this.cache.cctl = null;
          this.renderClimateControls();
        }, 4000);
      } else {
        this.armed = null;
        const v = k === 'alloff' ? 5 : (this.allSp ?? 21);
        this.ROOMS.forEach(r => hold(r.climate, v));
        this.call(
          'climate',
          'set_temperature',
          {entity_id: this.ROOMS.map(r => r.climate), temperature: v},
          k === 'alloff' ? 'All rooms off (5° frost guard)' : `All rooms set to ${v.toFixed(1)}°`,
        );
      }
    } else if (k === 'hpmode') {
      const v = b.dataset.v;
      hold('hp:mode', v);
      this.call(
        'climate',
        'set_hvac_mode',
        {entity_id: this.E.hp, hvac_mode: v},
        `Heat pump: ${(HVAC[v] || v).toLowerCase()}`,
      );
    } else if (k === 'hpsp') {
      const a = this.st(this.E.hp).attributes,
        v = Math.min(a.max_temp ?? 30, Math.max(a.min_temp ?? 16, +this.pend('hp:sp', a.temperature) + +b.dataset.d));
      hold('hp:sp', v);
      later('hp', () =>
        this.call(
          'climate',
          'set_temperature',
          {entity_id: this.E.hp, temperature: v},
          `Heat pump set to ${v.toFixed(1)}°`,
        ),
      );
    } else if (k === 'hpfan') {
      hold('hp:fan', b.dataset.v);
      this.call('climate', 'set_fan_mode', {entity_id: this.E.hp, fan_mode: b.dataset.v}, `Fan: ${b.dataset.v}`);
    } else if (k === 'hppre') {
      hold('hp:preset', b.dataset.v);
      this.call(
        'climate',
        'set_preset_mode',
        {entity_id: this.E.hp, preset_mode: b.dataset.v},
        `Preset: ${b.dataset.v === 'none' ? 'normal' : b.dataset.v}`,
      );
    }
    this.cache.cctl = null;
    this.renderClimateControls();
  }

  // ---------- car sheet ----------
  carSheet() {
    if (!this.car) {
      this.$('car-bat').innerHTML = '<div class="muted">No FordPass car found.</div>';
      return;
    }
    this.$('carh').textContent = this.carName();
    this.cache['car-charger'] = this.cache['car-comfort'] = null;
    this.renderCarSheetLive();
    this.renderSessions();
    const H = this.H,
      s = this.S();
    if (!H) return;
    const sess = H.sessions,
      tot = sum(sess.map(x => x.kwh)),
      price = this.num(this.E.wbPrice) ?? 0.07;
    this.$('sesp').textContent = sess.length
      ? `${sess.length} charging sessions on the Wallbox since ${this.fmtEn.date(sess[0].a)}. Cost is estimated at the ${(price * 100).toFixed(0)}¢/kWh set in the Wallbox app.`
      : 'No charging sessions in the last year.';
    this.$('sest').innerHTML = [
      ['Sessions', sess.length, '', sess.length ? 'since ' + this.fmtEn.date(sess[0].a) : ''],
      ['Delivered', this.fmtEn.integer(tot), 'kWh'],
      ['Average', sess.length ? (tot / sess.length).toFixed(1) : '–', 'kWh', 'per session'],
      ['Est. cost', '$' + Math.round(tot * price), '', `at ${(price * 100).toFixed(0)}¢/kWh`],
    ]
      .map(tile)
      .join('');
    const mon = {};
    sess.forEach(x => {
      const k = this.fmtEn.isoDay(x.a).slice(0, 7);
      mon[k] = mon[k] || [0, 0];
      mon[k][0] += x.kwh;
      mon[k][1]++;
    });
    const ks = Object.keys(mon).sort();
    this.mk(
      'c-carmon',
      merge(this.base(220), {
        chart: {type: 'bar'},
        series: [{name: 'Charged at home', data: ks.map(k => +mon[k][0].toFixed(1))}],
        colors: [s.ev],
        plotOptions: {bar: {borderRadius: 5, borderRadiusApplication: 'end', columnWidth: '56%'}},
        xaxis: {categories: ks.map(k => this.fmtUtcEn.month(monthAt(k), 'short'))},
        yaxis: {labels: {formatter: v => v.toFixed(0) + ' kWh'}},
        tooltip: {
          y: {formatter: (v, o) => `${Math.round(v)} kWh in ${plural(mon[ks[o.dataPointIndex]][1], 'session')}`},
        },
      }),
    );
  }
  renderSessions() {
    const H = this.H;
    if (!H) {
      this.$('slist').innerHTML = '';
      this.$('smore').hidden = true;
      return;
    }
    const all = H.sessions.slice().reverse(),
      rows = this.sesAll ? all : all.slice(0, 10),
      mx = Math.max(1, ...all.map(x => x.kwh)),
      price = this.num(this.E.wbPrice) ?? 0.07;
    this.$('slist').innerHTML = rows
      .map(
        x => `<tr><td>${this.fmtEn.dateWeekday(x.a)}</td><td class="hide-s">${this.fmtEn.time(x.a)} to ${this.fmtEn.time(x.b)}</td><td class="r hide-s">${Math.round((x.b - x.a) / 36e5)} h</td>
      <td><span class="bar" style="width:${Math.round((x.kwh / mx) * 70) + 4}px"></span>${x.kwh.toFixed(1)} kWh</td><td class="r hide-s">${x.pk.toFixed(1)} kW</td><td class="r">$${(x.kwh * price).toFixed(2)}</td></tr>`,
      )
      .join('');
    const m = this.$('smore');
    m.hidden = all.length <= 10;
    m.textContent = this.sesAll ? 'Show the latest 10' : `Show all ${all.length} sessions`;
  }
  renderCarSheetLive() {
    if (!this.car) return;
    const C = this.car,
      A = (k, a) => this.attr(C.id('sensor', k), a),
      c = this.carState();
    const lr = this.st(C.id('sensor', 'lastrefresh'));
    this.$('carsub').textContent = [
      c.where,
      c.locked == null ? '' : c.locked ? 'locked' : 'unlocked',
      ok(lr) ? 'the car last checked in at ' + this.fmtEn.time(new Date(lr.state)) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const el = this.st(C.id('sensor', 'elveh')),
      ea = el ? el.attributes : {},
      ch = c.chg ? c.chg.attributes : {};
    const cab = this.num(C.id('sensor', 'cabintemperature')),
      outc = this.num(C.id('sensor', 'outsidetemp'));
    this.set(
      'car-bat',
      `<h3>Battery</h3><p>${ea.batteryEnergyRemaining != null ? `${f1(ea.batteryEnergyRemaining)} of ${f1(ea.maximumBatteryCapacity)} kWh usable` : ''}${ch.batteryTemperature != null ? ` · battery at ${f1(ch.batteryTemperature)}°` : ''}</p>
      <div class="carhero"><div><div class="t">${f1(c.soc)}<small>%</small></div><div class="muted" style="font-size:14px;margin-top:4px">${c.range != null ? Math.round(c.range) + ' km range' : ''}</div></div>${this.carImg()}</div>
      <div class="socbar" role="img" aria-label="Battery ${f1(c.soc)} percent"><i style="width:${c.soc || 0}%"></i>${c.lim ? `<b style="left:${c.lim}%"></b>` : ''}</div>
      <div class="socscale"><span>0%</span><span>${c.lim ? 'Charge limit ' + c.lim + '%' : ''}</span><span>100%</span></div>
      <div class="tiles" style="margin-top:14px">${tiles([
        ['Full range', ea.maximumBatteryRange != null ? Math.round(ea.maximumBatteryRange) : '–', 'km', 'at 100%'],
        [
          'Plug',
          `<span style="font-size:18px">${c.charging ? 'Charging' : c.plugged ? 'Plugged in' : 'Unplugged'}</span>`,
          '',
          c.charging && ch.chargingkW ? f1(ch.chargingkW) + ' kW' : '',
        ],
        ['AC limit', this.num(C.id('number', 'globalaccurrentlimit')) ?? ch.globalAcCurrentLimit ?? '–', 'A'],
        ['Cabin', f1(cab), '°', outc != null ? `outside ${f1(outc)}°` : ''],
      ])}</div>`,
    );
    const tp = this.st(C.id('sensor', 'tirepressure')),
      ta = tp ? tp.attributes : {};
    const psi = k => {
      const m = String(ta[k] ?? '').match(/(-?[\d.]+)\s*([a-z]*)/i);
      if (!m) return '–';
      const v = +m[1],
        u = m[2].toLowerCase();
      // fordpass reports "3.02 bar" / "302 kPa" / "43.8 psi" depending on HA's unit system; bare numbers are guessed by size
      const p =
        u === 'psi'
          ? v
          : u === 'bar'
            ? v * 14.5038
            : u === 'kpa'
              ? v * 0.145038
              : u === 'pa'
                ? v / 6894.757
                : v > 1000
                  ? v / 6894.757
                  : v > 100
                    ? v * 0.145038
                    : v < 10
                      ? v * 14.5038
                      : v;
      return Number.isFinite(p) ? p.toFixed(1) : '–';
    };
    const tst = k =>
      ta[k + '_state']
        ? `<div class="s" style="${ta[k + '_state'] === 'NORMAL' ? '' : 'color:var(--warn)'}">${ta[k + '_state'] === 'NORMAL' ? 'Normal' : esc(String(ta[k + '_state']).toLowerCase())}</div>`
        : '';
    const tpc = (k, n) =>
      `<div class="tp"><div class="k">${n}</div><div class="v">${psi(k)}<small>psi</small></div>${tst(k)}</div>`;
    const ds = this.st(C.id('sensor', 'doorstatus')),
      win = this.st(C.id('sensor', 'windowposition')),
      alarm = this.st(C.id('sensor', 'alarm')),
      gear = this.st(C.id('sensor', 'gearleverposition'));
    const da = ds ? ds.attributes : {},
      closed = k => da[k] == null || da[k] === 'CLOSED';
    const chips = [
      [
        ok(ds)
          ? ['driverFront', 'passengerFront', 'rearLeft', 'rearRight'].every(closed)
            ? 'Doors closed'
            : 'A door is open'
          : null,
        ['driverFront', 'passengerFront', 'rearLeft', 'rearRight'].every(closed),
      ],
      [
        ok(win) ? (win.state === 'Closed' ? 'Windows closed' : 'A window is open') : null,
        ok(win) && win.state === 'Closed',
      ],
      [
        ok(ds) ? (closed('hood') && closed('tailgate') ? 'Hood and tailgate closed' : 'Hood or tailgate open') : null,
        closed('hood') && closed('tailgate'),
      ],
      [c.locked == null ? null : c.locked ? 'Locked' : 'Unlocked', !!c.locked],
      [ok(alarm) ? (alarm.state === 'DISARMED' ? 'Alarm off' : 'Alarm ' + alarm.state.toLowerCase()) : null, true],
      [ok(gear) ? (gear.state === 'PARK' ? 'In park' : 'Gear ' + gear.state.toLowerCase()) : null, true],
    ].filter(x => x[0]);
    const b12 = this.num(C.id('sensor', 'battery')),
      fw = this.st(C.id('sensor', 'lastfirmwareupdate')),
      au = this.st(C.id('switch', 'autosoftwareupdates'));
    this.set(
      'car-status',
      `<h3>Car status</h3><p>Tire pressures from the car's sensors</p>
      <div class="tpms">${tpc('frontLeft', 'Front left')}${CARTOP}${tpc('frontRight', 'Front right')}${tpc('rearLeft', 'Rear left')}${tpc('rearRight', 'Rear right')}</div>
      <div class="clear">${chips.map(([t, good]) => `<span${good ? '' : ' style="color:var(--warn)"'}>${t}</span>`).join('')}</div>
      <div class="tiles">${tiles([
        [
          'Odometer',
          this.num(C.id('sensor', 'odometer')) == null ? '–' : this.fmtEn.integer(this.num(C.id('sensor', 'odometer'))),
          'km',
        ],
        [
          '12 V battery',
          b12 ?? '–',
          '%',
          A('battery', 'batteryVoltage') ? (+A('battery', 'batteryVoltage')).toFixed(1) + ' V' : '',
        ],
        [
          'Software',
          `<span style="font-size:18px">${esc(fw ? fw.attributes.firmwareVersion || '–' : '–')}</span>`,
          '',
          ok(fw) ? 'since ' + this.fmtEn.date(new Date(fw.state)) : '',
        ],
        ['Auto updates', `<span style="font-size:18px">${ok(au) ? (au.state === 'on' ? 'On' : 'Off') : '–'}</span>`],
      ])}</div>`,
    );
    this.renderCarControls();
    // From Ford + last plug-in
    const msgs = (A('messages', 'json_src') || []).slice(0, 3),
      dep = this.st(C.id('switch', 'departuretimes'));
    const rows = msgs.map(m => {
      const created = m.createdDate ? asDate(Date.parse(m.createdDate) || m.createdDate) : null; // Ford's text, not always a date
      return `<div class="arow"><span class="ic acc" style="--acc:var(--warn)">!</span><div><b>${esc(m.messageSubject)}${created ? ', ' + esc(this.fmtEn.date(created)) : ''}</b><span>${esc(m.messageBody)}</span></div></div>`;
    });
    rows.push(
      `<div class="arow"><span class="ic acc" style="--acc:var(--fg3);--acc-c:var(--fg2)">${ico('clock', 16)}</span><div><b>Departure times ${ok(dep) && dep.state === 'on' ? 'on' : 'off'}</b><span>${esc(this.schedText())}</span></div></div>`,
    );
    this.set(
      'car-ford',
      `<h3>From Ford</h3><p>Messages and schedules from the FordPass app</p><div class="att">${rows.join('')}</div>`,
    );
    const tl = A('energytransferlogentry', 'plugDetails'),
      soc2 = A('energytransferlogentry', 'stateOfCharge');
    let delivered = null;
    if (tl && this.H) {
      const a = Date.parse(tl.plugInTime),
        b = Date.parse(tl.plugOutTime);
      delivered = sum(this.H.sessions.filter(x => x.b > a && x.a < b).map(x => x.kwh));
    }
    this.set(
      'car-last',
      tl
        ? `<h3>Last plug-in, per Ford</h3><p>${this.plugStamp(tl.plugInTime)} to ${this.plugStamp(tl.plugOutTime)}</p>
      <div class="tiles">${[
        [
          'Battery',
          soc2 ? `${soc2.firstSOC}→${soc2.lastSOC}` : '–',
          '%',
          soc2 && c.lim && soc2.lastSOC >= c.lim ? 'stopped at the limit' : '',
        ],
        ['Range added', tl.totalDistanceAdded != null ? Math.round(tl.totalDistanceAdded) : '–', 'km'],
        ['Plugged in', tl.totalPluggedInTime ? (tl.totalPluggedInTime / 3600).toFixed(1) : '–', 'h'],
        ['Delivered', delivered != null ? delivered.toFixed(1) : '–', 'kWh', 'per the Wallbox'],
      ]
        .map(tile)
        .join('')}</div>`
        : "<h3>Last plug-in</h3><p>Ford hasn't reported a charging session yet.</p>",
    );
  }
  // Ford's plug-in or plug-out time as `Nov 6, 5:00 pm`, or a dash where Ford sent none or sent something that is not a date
  plugStamp(v) {
    const d = asDate(v);
    return d ? `${this.fmtEn.date(d)}, ${this.fmtEn.time(d)}` : '–';
  }
  // a time of day with no date, such as the departure schedule's hours and minutes: placed on a fixed UTC day and read
  // back by the UTC set, so that neither the browser's zone nor the house's moves it
  clockTime(h, m) {
    return this.fmtUtcEn.time(Date.UTC(2026, 0, 1, h, m));
  }
  schedText() {
    const sch = this.attr(this.car.id('sensor', 'departureschedules'), 'schedule') || {};
    const days = Object.keys(sch);
    if (!days.length) return 'No departure times saved.';
    const t0 = sch[days[0]].timeOfDay || {},
      time = this.clockTime(t0.hours || 0, t0.minutes || 0);
    const wk = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const d =
      days.length === 7
        ? 'Every day'
        : days.length === 5 && wk.every(x => days.includes(x))
          ? 'Weekdays'
          : days.map(x => x.slice(0, 3).replace(/^./, c => c.toUpperCase())).join(', ');
    return `${d} at ${time} saved.`;
  }

  // ---------- car + charger controls ----------
  sw(id) {
    const p = this.pending[id];
    if (p != null && Date.now() < p.until) return p.on;
    const s = this.st(id);
    return ok(s) ? ['on', 'locked'].includes(s.state) : null;
  }
  renderCarControls() {
    const C = this.car;
    if (!C || !this.sheets.isOpen('sh-car')) return;
    const amps = this.st(this.E.wbAmps),
      cur = this.pending.amps && Date.now() < this.pending.amps.until ? this.pending.amps.v : this.num(this.E.wbAmps);
    const mn = amps ? amps.attributes.min || 6 : 6,
      mx = amps ? amps.attributes.max || 48 : 48;
    const steps = [16, 24, 32, 40, 48].filter(a => a >= mn && a <= mx);
    const c = this.carState(),
      wb = this.st(this.E.wbStatus),
      pause = this.st(this.E.wbPause),
      wlock = this.sw(this.E.wbLock);
    const lim = c.lim,
      limOpts = [50, 60, 70, 80, 90, 100];
    const charging = this.sw(this.E.wbPause);
    this.set(
      'car-charger',
      `<h3>Home charger</h3><p>Wallbox Pulsar Plus · ${esc(ok(wb) ? wb.state.toLowerCase() : 'unavailable')}${c.plugged ? '' : ', car not plugged in'}</p>
      <div class="ctl-l">Power limit</div>
      <div class="seg${ok(amps) ? '' : ' dis'}" role="radiogroup" aria-label="Charging current limit">${steps.map(a => `<button type="button" role="radio" aria-checked="${Math.round(cur) === a}" data-k="amps" data-a="${a}" ${ok(amps) ? '' : 'disabled'}><b>${a} A</b><small>${(a * 0.24).toFixed(1)} kW</small></button>`).join('')}</div>
      <div class="hint">Sets the Wallbox maximum current${cur != null && !steps.includes(Math.round(cur)) ? ` (now ${Math.round(cur)} A)` : ''}. kW assumes 240 V.</div>
      <div class="ctl-l">Charge limit</div>
      <div class="seg dis" role="radiogroup" aria-label="Charge limit, read only" aria-disabled="true">${limOpts.map(v => `<button type="button" role="radio" aria-checked="${lim === v}" disabled><b>${v === 100 ? 'Full' : v + '%'}</b></button>`).join('')}</div>
      <div class="hint">Set in the FordPass app. Home Assistant can read it but has no control for it.</div>
      <div class="tgl"><div class="tx"><b>Charging</b><span>${ok(pause) ? (charging ? 'On. Turn off to pause' : 'Paused. Turn on to resume') : 'Available while the car is plugged in'}</span></div><button class="sw" type="button" role="switch" aria-checked="${!!charging}" aria-label="Charging" data-k="pause" ${ok(pause) ? '' : 'disabled'}></button></div>
      <div class="tgl"><div class="tx"><b>Lock charger</b><span>${wlock ? 'Locked, needs the app or RFID card' : 'Unlocked, anyone can plug in'}</span></div><button class="sw" type="button" role="switch" aria-checked="${!!wlock}" aria-label="Lock charger" data-k="wblock" ${this.st(this.E.wbLock) && ok(this.st(this.E.wbLock)) ? '' : 'disabled'}></button></div>`,
    );
    const rs = this.sw(C.id('switch', 'ignition')),
      cabin = this.st(C.id('select', 'rcctemperature')),
      seat = this.st(C.id('select', 'rccseatfrontleft'));
    const opt = (k, key, icon, name) => {
      const on = this.sw(C.id('switch', key)),
        s = this.st(C.id('switch', key));
      return `<button class="cbtn${this.armed === k ? ' armed' : ''}" type="button" aria-pressed="${!!on}" data-k="${k}" ${ok(s) ? '' : 'disabled'}><span class="ic">${ico(icon, 18)}</span><div><b>${this.armed === k ? 'Tap again to start' : name}</b><br><span>${k === 'rs' ? (rs ? 'Running' : 'Off') + (ok(cabin) ? ' · cabin ' + esc(cabin.state.toUpperCase()) : '') : 'With remote start: ' + (on ? 'on' : 'off')}</span></div></button>`;
    };
    const seatTxt =
      ok(seat) && /heated(\d)/.test(seat.state)
        ? `Front seats heat at level ${seat.state.match(/heated(\d)/)[1]} with remote start.`
        : ok(seat) && /cooled(\d)/.test(seat.state)
          ? `Front seats cool at level ${seat.state.match(/cooled(\d)/)[1]} with remote start.`
          : '';
    const lockOk = ok(this.st(C.id('lock', 'doorlock'))),
      locked = this.sw(C.id('lock', 'doorlock'));
    const honk = [C.id('button', 'hafdefault'), C.id('button', 'hafshort')].find(
      id => ok(this.st(id)) || (this.st(id) && this.st(id).state === 'unknown'),
    );
    const D = this.depState();
    const dayN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    this.set(
      'car-comfort',
      `<h3>Comfort and access</h3><p>Remote start warms or cools the cabin for about 15 minutes</p>
      <div class="ctls">${opt('rs', 'ignition', 'fan', 'Remote start')}${opt('deff', 'rccdefrostfront', 'wind', 'Heated windshield')}${opt('defr', 'rccdefrostrear', 'rear', 'Rear defrost')}${opt('wheel', 'rccsteeringwheel', 'wheel', 'Heated wheel')}</div>
      ${seatTxt ? `<div class="hint">${seatTxt}</div>` : ''}
      <div class="access"><div class="tx"><b>${locked == null ? 'Lock status unknown' : locked ? 'Locked' : 'Unlocked'}</b><span>${esc(this.closedText())}</span></div>
        ${honk ? `<button class="abtn" type="button" data-k="honk" data-id="${honk}">Honk &amp; flash</button>` : ''}
        <button class="abtn${this.armed === 'lock' ? ' armed' : ''}" type="button" data-k="lock" ${lockOk ? '' : 'disabled'}>${this.armed === 'lock' ? 'Tap again to unlock' : locked ? 'Unlock' : 'Lock'}</button></div>
      <div class="ctl-l" style="margin-top:18px">Departure times</div>
      <div class="tgl" style="margin-top:0"><div class="tx"><b>Precondition for departure</b><span>${D.on ? 'On' : 'Off'} · ${esc(this.depDesc(D))}${D.on ? '' : ' saved'}</span></div><button class="sw" type="button" role="switch" aria-checked="${D.on}" aria-label="Departure times" data-k="dep" ${D.ok ? '' : 'disabled'}></button></div>
      <div class="deprow"><div class="days" role="group" aria-label="Departure days">${dayN.map((n, i) => `<button type="button" aria-pressed="${D.days.includes(n)}" aria-label="${n}" data-k="day" data-d="${n}">${this.store.isFrench ? 'LMMJVSD'[i] : n[0].toUpperCase()}</button>`).join('')}</div>
        <input class="dtime" id="deptime" type="time" value="${D.time}" step="300" aria-label="Departure time"></div>
      <div class="seg" role="radiogroup" aria-label="Cabin temperature at departure" style="margin-top:8px">${[
        ['low', 'Cool'],
        ['medium', 'Medium'],
        ['high', 'Warm'],
        ['off', 'Off'],
      ]
        .map(
          ([v, l]) =>
            `<button type="button" role="radio" aria-checked="${D.temp === v}" data-k="deptemp" data-t="${v}"><b>${l}</b></button>`,
        )
        .join('')}</div>
      <div class="hint">When the car is plugged in, it warms the cabin and the battery to be ready at this time. Ford doesn't report the cabin setting of a saved schedule, so pick one before saving.</div>
      <button class="more" type="button" data-k="depsave" style="margin-top:10px">Save schedule</button>`,
    );
  }
  closedText() {
    const ds = this.st(this.car.id('sensor', 'doorstatus')),
      win = this.st(this.car.id('sensor', 'windowposition'));
    if (!ok(ds)) return '';
    const open = Object.entries(ds.attributes)
      .filter(([, v]) => v === 'OPEN' || v === 'AJAR')
      .map(([k]) => k);
    return open.length
      ? 'Open: ' + open.join(', ')
      : `All doors${ok(win) && win.state === 'Closed' ? ', windows' : ''}, hood and tailgate closed`;
  }
  depState() {
    const sch = this.attr(this.car.id('sensor', 'departureschedules'), 'schedule') || {},
      s = this.st(this.car.id('switch', 'departuretimes'));
    if (!this.depDraft) {
      const days = Object.keys(sch),
        t0 = days.length ? sch[days[0]].timeOfDay || {} : {hours: 8, minutes: 0};
      this.depDraft = {
        days,
        time: `${String(t0.hours || 0).padStart(2, '0')}:${String(t0.minutes || 0).padStart(2, '0')}`,
        temp: null,
      };
    }
    const p = this.pending.dep,
      on = p && Date.now() < p.until ? p.on : ok(s) && s.state === 'on';
    return {...this.depDraft, on, ok: ok(s)};
  }
  depDesc(D) {
    const wk = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      d = D.days;
    const txt =
      d.length === 7
        ? 'every day'
        : d.length === 5 && wk.every(x => d.includes(x))
          ? 'weekdays'
          : d.map(x => x.slice(0, 3).replace(/^./, c => c.toUpperCase())).join(', ') || 'no days';
    const [h, m] = D.time.split(':').map(Number);
    // a cleared time field is '': no time to name (the formatter throws on an invalid date, and this redraws every second)
    return Number.isFinite(h) && Number.isFinite(m) ? `${txt} at ${this.clockTime(h, m)}` : txt;
  }
  carControl(e) {
    const b = e.target.closest('[data-k]');
    if (!b || b.disabled || !this.car) return;
    const C = this.car,
      k = b.dataset.k,
      hold = (key, v) => {
        this.pending[key] = {...v, until: Date.now() + 20000};
      };
    const swToggle = (id, label) => {
      const on = !this.sw(id);
      hold(id, {on});
      this.call('switch', on ? 'turn_on' : 'turn_off', {entity_id: id}, `${label} ${on ? 'on' : 'off'}`);
    };
    const arm = key => {
      this.armed = key;
      clearTimeout(this.armT);
      this.armT = setTimeout(() => {
        this.armed = null;
        this.renderCarControls();
      }, 4000);
    };
    if (k === 'amps') {
      const a = +b.dataset.a;
      this.pending.amps = {v: a, until: Date.now() + 20000};
      this.call('number', 'set_value', {entity_id: this.E.wbAmps, value: a}, `Wallbox limit set to ${a} A`);
    } else if (k === 'pause') swToggle(this.E.wbPause, 'Charging');
    else if (k === 'wblock') {
      const on = !this.sw(this.E.wbLock);
      hold(this.E.wbLock, {on});
      this.call('lock', on ? 'lock' : 'unlock', {entity_id: this.E.wbLock}, on ? 'Charger locked' : 'Charger unlocked');
    } else if (k === 'rs') {
      const id = C.id('switch', 'ignition'),
        on = this.sw(id);
      // Remote start and unlock need a second tap, so a stray touch on a wall panel does nothing.
      if (!on && this.armed !== 'rs') {
        arm('rs');
      } else {
        this.armed = null;
        hold(id, {on: !on});
        this.call(
          'switch',
          on ? 'turn_off' : 'turn_on',
          {entity_id: id},
          on ? 'Remote start stopped' : 'Remote start sent to the car',
        );
      }
    } else if (k === 'deff') swToggle(C.id('switch', 'rccdefrostfront'), 'Heated windshield');
    else if (k === 'defr') swToggle(C.id('switch', 'rccdefrostrear'), 'Rear defrost');
    else if (k === 'wheel') swToggle(C.id('switch', 'rccsteeringwheel'), 'Heated wheel');
    else if (k === 'honk') this.call('button', 'press', {entity_id: b.dataset.id}, 'Honk and flash sent');
    else if (k === 'lock') {
      const id = C.id('lock', 'doorlock'),
        locked = this.sw(id);
      if (locked && this.armed !== 'lock') arm('lock');
      else {
        this.armed = null;
        hold(id, {on: !locked});
        this.call(
          'lock',
          locked ? 'unlock' : 'lock',
          {entity_id: id},
          locked ? 'Unlock sent to the car' : 'Lock sent to the car',
        );
      }
    } else if (k === 'dep') {
      const on = !this.depState().on;
      this.pending.dep = {on, until: Date.now() + 20000};
      this.call(
        'switch',
        on ? 'turn_on' : 'turn_off',
        {entity_id: C.id('switch', 'departuretimes')},
        `Departure times ${on ? 'on' : 'off'}`,
      );
    } else if (k === 'day') {
      const d = b.dataset.d,
        D = this.depDraft;
      D.days = D.days.includes(d) ? D.days.filter(x => x !== d) : [...D.days, d];
    } else if (k === 'deptemp') {
      this.depDraft.temp = b.dataset.t;
    } else if (k === 'depsave') {
      const D = this.depDraft;
      if (!D.temp) {
        this.toast('Pick a cabin temperature first');
        return;
      }
      if (!D.days.length) {
        this.toast('Pick at least one day');
        return;
      }
      const [h, m] = D.time.split(':').map(Number),
        t = (Math.round((h * 60 + m) / 5) * 5) % 1440;
      D.time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; // Ford takes 5-minute steps
      this.call(
        'fordpass',
        'update_departure_schedule',
        {hour: Math.floor(t / 60), minute: t % 60, schedule_days: D.days, precondition_temperature: D.temp},
        `Departure schedule saved: ${this.depDesc(D)}`,
      );
    }
    this.renderCarControls();
  }
}

const merge = (a, b, ...more) => {
  for (const k in b)
    a[k] =
      b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object'
        ? merge({...a[k]}, b[k])
        : b[k];
  return more.length ? merge(a, ...more) : a;
};

Object.assign(LegacyPanel.prototype, autoMethods);
