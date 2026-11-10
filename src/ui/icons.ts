// The panel's icons as Lit templates: `ico(name, size)` draws one, and `IconName` is the set a descriptor may name.
// Pattern: Registry (Fowler, PoEAA) of static templates (Lit docs, Templates: parsed once, never re-rendered); the paths are
// those of the legacy class's `ico`, and a test compares them with its text. A name arrives here with its first user.
// Must not: import a feature or the shell, or draw anything but an `<svg>` that takes its colour from `currentColor`.
import {svg, type SVGTemplateResult} from 'lit';

/** The inner markup of each icon, 24 by 24, stroked with the current colour. */
export const ICONS = {
  house: svg`<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>`,
  bulb: svg`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>`,
  therm: svg`<path d="M10 3a2 2 0 0 1 4 0v10.3a4.5 4.5 0 1 1-4 0z"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/>`,
  wx: svg`<path d="M9 3v1.5M3.5 5.5l1 1M2 10h1.5M13.5 6.5l1-1M5.5 10a3.5 3.5 0 0 1 6.4-2M8 20h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 8 20z"/>`,
  car: svg`<path d="M5 16 6.5 10a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16M4 16h16v3H4zM7 19v2M17 19v2"/>`,
  bolt: svg`<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`,
  aq: svg`<path d="M7.5 19.8a9 9 0 1 1 9 0"/><path d="M10 9h.01M14 9h.01M8.5 12h.01M12 11h.01M15.5 12h.01M10 15h.01M14 15h.01M12 13.8h.01"/>`,
  tv: svg`<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8"/>`,
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
