// The five contexts the shell provides: the store, the API client, the settings, the optimistic values and the appearance, one typed key each.
// Pattern: context protocol (W3C Community Group, Context Protocol; Lit's @lit/context): a provider at the root, a
// consumer anywhere below finds it by a DOM event, so no level of the tree threads a service through its properties.
// They live in the kit, not the shell: the kit's controllers consume them, and the kit may not import the shell, so
// the `Appearance` type they carry lives here too.
// Must not: hold a value (the shell's providers do), or be imported by the core, which knows no context.
import {createContext} from '@lit/context';
import type {PanelApi} from '../core/api.ts';
import type {PanelSettings} from '../core/settings.ts';
import type {PanelStore} from '../core/store.ts';
import type {OverlayStore} from './overlay-store.ts';

// A Symbol key is unique to this module, so another library's context named 'store' cannot answer these requests.
export const storeContext = createContext<PanelStore>(Symbol('home-panel.store'));
export const apiContext = createContext<PanelApi>(Symbol('home-panel.api'));
export const settingsContext = createContext<PanelSettings>(Symbol('home-panel.settings'));
/** The panel's optimistic values, one store per panel so two panels stay independent (ADR 0023). */
export const optimisticContext = createContext<OverlayStore>(Symbol('home-panel.optimistic'));

/**
 * How the panel looks now, as one value the shell replaces whole when anything in it changes, so a consumer compares
 * by reference. The shell's `AppearanceController` builds it and freezes it.
 */
export interface Appearance {
  /** Dark or light, from the setting, the device and the sun. */
  readonly theme: 'light' | 'dark';
  /** Under 600 px wide: the phone's shape. */
  readonly compact: boolean;
  /** Home Assistant's sidebar is collapsed. */
  readonly narrow: boolean;
  readonly glass: {
    readonly on: boolean;
    /** The wallpaper in force (the sky's pick when Sky is chosen); null when glass is off. */
    readonly wallpaper: string | null;
    /** The fill-alpha multiplier (`--g-m`) the transparency setting gives. */
    readonly density: number;
  };
  /** The text size multiplier (`--tx`). */
  readonly textScale: number;
  /** 1.25 or more: a row that no longer fits may wrap. */
  readonly largeText: boolean;
  /** The device asks for less transparency. */
  readonly reducedTransparency: boolean;
  /** Something was touched in the last minute. */
  readonly live: boolean;
}

export const appearanceContext = createContext<Appearance>(Symbol('home-panel.appearance'));
