// The per-browser settings (theme, text size, wallpaper, glass level, last tab) behind a storage parameter.
// Pattern: a seam with two adapters, the browser's localStorage and a Map in tests (Feathers, Working Effectively
// with Legacy Code); parse at the edge, so a bad value becomes the default (King, Parse, don't validate).
// Must not: touch localStorage or any global, throw on a bad or blocked storage, or change a key or a stored value.

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
  tab: string;
}

export interface PanelSettings {
  get(): Settings;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

const KEYS: Record<keyof Settings, string> = {
  theme: 'home-panel-theme',
  text: 'home-panel-text',
  glass: 'home-panel-glass',
  glassLevel: 'home-panel-glass-t',
  tab: 'home-panel-tab',
};
const VERSION_KEY = 'home-panel-settings';
const VERSION = '1';

export function createSettings(storage: KeyValueStorage): PanelSettings {
  let versioned = false;

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

  return {
    get: () => ({
      theme: read('theme') || 'auto',
      text: read('text') || 'auto',
      glass: read('glass') || 'dawn',
      glassLevel: glassLevel(),
      tab: read('tab') || 'home',
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
    },
  };
}
