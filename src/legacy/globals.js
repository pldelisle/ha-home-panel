// Scaffolding, not design: the module-level state and helpers that home-panel.js, auto.js and fr.js used to share as
// globals in one spliced script. Every export here is something phase 2 (the store, Lit components) must remove, so
// keep the list short and do not add to it. See docs/specs/06-vite-build.md.

export const VERSION = __VERSION__; // injected from package.json by vite.config.ts (and vitest.config.ts)
// the folder home-panel.js was loaded from; the vendor files sit beside it
export const BASE = new URL(/* @vite-ignore */ '.', import.meta.url).href;

// the two mutable variables, behind accessors because an importing module cannot assign to an imported binding
let hass = null;
let TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const getHass = () => hass;
export const setHass = h => {
  hass = h;
};
export const getTZ = () => TZ;
export const setTZ = z => {
  TZ = z;
};

// ---------- small helpers ----------
export const st = id => hass && hass.states[id];
export const ok = s => s && s.state !== 'unavailable' && s.state !== 'unknown';
export const num = id => {
  const s = st(id);
  if (!ok(s)) return null;
  const v = parseFloat(s.state);
  return Number.isFinite(v) ? v : null;
};
export const attr = (id, a) => {
  const s = st(id);
  return s ? s.attributes[a] : undefined;
};
export const kw = id => {
  const v = num(id);
  if (v == null) return null;
  const u = attr(id, 'unit_of_measurement');
  return u === 'W' ? v / 1000 : v;
};
export const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
export const ampm = s => s.replace(/\s?([ap])\.\s?m\.?/i, ' $1m');
export const fmtTime = d =>
  ampm(new Date(d).toLocaleTimeString('en-CA', {hour: 'numeric', minute: '2-digit', timeZone: TZ}));
export const fmtDate = d => new Date(d).toLocaleDateString('en-CA', {month: 'short', day: 'numeric', timeZone: TZ});
export const localDay = ms => new Date(ms).toLocaleDateString('en-CA', {timeZone: TZ});
export const hourNow = () => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = t => +p.find(x => x.type === t).value;
  return g('hour') + g('minute') / 60;
};
/** @param {any[]} t [label, value, unit, sub-line] */
export const tile = ([k, v, u, sb]) =>
  `<div class="tile"><div class="k">${k}</div><div class="v num">${v}<small>${u || ''}</small></div>${sb ? `<div class="s">${sb}</div>` : ''}</div>`;
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const cap = s =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase());

export function loadScript(src, key = 'apex', ready = () => window.ApexCharts) {
  return new Promise((res, rej) => {
    if (ready()) return res();
    let s = /** @type {HTMLScriptElement | null} */ (document.querySelector(`script[data-home-panel="${key}"]`));
    if (!s) {
      s = document.createElement('script');
      s.src = src;
      s.dataset.homePanel = key;
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => res());
    s.addEventListener('error', rej);
  });
}
