// Pure helpers only, no state: the small functions home-panel.js and auto.js still share while the rewrite goes on.
// Nothing here reads Home Assistant or the time zone; those live in the panel's store (src/core/store.ts).
// Scaffolding, not design: do not add to this list. See docs/specs/06-vite-build.md.

export const ok = s => s && s.state !== 'unavailable' && s.state !== 'unknown';
export const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
/** @param {any[]} t [label, value, unit, sub-line] */
export const tile = ([k, v, u, sb]) =>
  `<div class="tile"><div class="k">${k}</div><div class="v num">${v}<small>${u || ''}</small></div>${sb ? `<div class="s">${sb}</div>` : ''}</div>`;
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const cap = s =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase());
