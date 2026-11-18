// The per-browser settings (theme, text size, wallpaper, glass level, last tab, design, sidebar) behind a storage parameter.
// Pattern: a Storage-like parameter (accept dependencies, don't create them: Ousterhout, A Philosophy of Software
// Design); parse at the edge, so a bad value becomes the default (King, Parse, don't validate).
// Observer (Gamma et al., Design Patterns): `subscribe` tells a listener after each write, so what reads a setting need not poll.
// The device's default design comes in as a parameter too (`SettingsDefaults`), from `deviceDesign`.
// Must not: touch localStorage or any global, throw on a bad or blocked storage, or change a key or a stored value.

import {parseSeed} from './seeds.ts';

/** The slice of the browser's Storage that the settings use; the element passes localStorage. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Settings {
  theme: string;
  text: string;
  glass: string;
  /** Glass transparency, 0 to 100. */
  glassLevel: number;
  /** With glass on, the cards are opaque (`solid`, Apple's rule) or glass too (`glass`, the panel's older look). */
  cards: string;
  tab: string;
  /** The design language: `apple` (Liquid Glass) or `material` (a tonal palette, no glass); nothing stored, or anything else, parses to the
   * device's default (`SettingsDefaults.design`, `apple` when none is given). */
  design: string;
  /** Under Material, the seed the palette is built from (`house`, `dawn`, ...); anything else parses to `house`, and Apple keeps it for the way back. */
  seed: string;
  /** The Liquid Glass tablet's sidebar: `collapsed` (an icon strip, the default) or `open` (icons and labels); anything else parses to `collapsed`. */
  sidebar: string;
}

export interface PanelSettings {
  get(): Settings;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  /** Calls `listener` synchronously after every `set`, written or not; returns the function that stops it. */
  subscribe(listener: () => void): () => void;
}

const KEYS: Record<keyof Settings, string> = {
  theme: 'home-panel-theme',
  text: 'home-panel-text',
  glass: 'home-panel-glass',
  glassLevel: 'home-panel-glass-t',
  cards: 'home-panel-cards',
  tab: 'home-panel-tab',
  design: 'home-panel-design',
  seed: 'home-panel-seed',
  sidebar: 'home-panel-sidebar',
};
const VERSION_KEY = 'home-panel-settings';
const VERSION = '1';

/** What the device decides before the person does; the shell passes it (the core reads no global). */
export interface SettingsDefaults {
  design?: 'apple' | 'material';
}

export function createSettings(storage: KeyValueStorage, defaults: SettingsDefaults = {}): PanelSettings {
  const deviceDesign = defaults.design ?? 'apple';
  let versioned = false;
  const listeners = new Set<() => void>();

  const read = (key: keyof Settings): string | null => {
    try {
      return storage.getItem(KEYS[key]);
    } catch {
      return null; // private browsing or blocked site data: use the default
    }
  };

  const glassLevel = (): number => {
    const v = parseInt(read('glassLevel') ?? '', 10);
    return Number.isNaN(v) ? 50 : Math.max(0, Math.min(100, v));
  };

  // a stored choice wins; nothing stored, or anything but the two names, is the device's
  const design = (): string => {
    const v = read('design');
    return v === 'material' || v === 'apple' ? v : deviceDesign;
  };

  return {
    get: () => ({
      theme: read('theme') || 'auto',
      text: read('text') || 'auto',
      glass: read('glass') || 'dawn',
      glassLevel: glassLevel(),
      cards: read('cards') === 'glass' ? 'glass' : 'solid',
      tab: read('tab') || 'home',
      design: design(),
      seed: parseSeed(read('seed')),
      sidebar: read('sidebar') === 'open' ? 'open' : 'collapsed',
    }),

    set(key, value) {
      try {
        // the schema version goes in with the first write, so a later change of shape can migrate
        if (!versioned) {
          storage.setItem(VERSION_KEY, VERSION);
          versioned = true;
        }
        storage.setItem(KEYS[key], String(value));
      } catch {
        // a full quota or blocked storage: the setting lasts until the page reloads
      }
      // a copy, so a listener that stops itself or another does not change who is told this time
      for (const listener of [...listeners]) listener();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
