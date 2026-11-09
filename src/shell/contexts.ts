// The three contexts the shell provides: the store, the API client and the settings, one typed key each.
// Pattern: context protocol (W3C Community Group, Context Protocol; Lit's @lit/context): a provider at the root, a
// consumer anywhere below finds it by a DOM event, so no level of the tree threads a service through its properties.
// Must not: hold a value (the shell's providers do), or be imported by the core, which knows no context.
import {createContext} from '@lit/context';
import type {PanelApi} from '../core/api.ts';
import type {PanelSettings} from '../core/settings.ts';
import type {PanelStore} from '../core/store.ts';

// A Symbol key is unique to this module, so another library's context named 'store' cannot answer these requests.
export const storeContext = createContext<PanelStore>(Symbol('home-panel.store'));
export const apiContext = createContext<PanelApi>(Symbol('home-panel.api'));
export const settingsContext = createContext<PanelSettings>(Symbol('home-panel.settings'));
