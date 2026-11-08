// Ambient declarations for tsconfig.legacy.json, and for nothing else: only that config lists this file, and
// tsconfig.json excludes it, so ESLint's typed project, editors and the Playwright specs never see it.
//
// The legacy files are checked loosely on purpose (spec 06). They treat `event.target` and the result of
// `querySelector` as HTML elements, set properties on the custom Home Assistant elements they create, and call
// methods that Object.assign puts on the class. These declarations say so once, so that the checker stays on what it
// is for in those files (an import that does not resolve, a name that is not defined) without a cast at each of a
// hundred sites. Phase 2 types the elements and deletes this file with the legacy files.

// `any` is the point of these declarations: the legacy files are not typed. (ESLint skips this file, see its ignores.)

// a file with an export is a module, which is what lets `declare global` and `declare module` below augment
export {};

declare global {
  // the vendored libraries put themselves on window when loadScript() has loaded them
  interface Window {
    mermaid: any;
  }
  interface EventTarget {
    closest(selectors: string): any;
    classList: DOMTokenList;
    click(): void;
  }
  interface ParentNode {
    querySelector(selectors: string): HTMLElement | null;
    querySelectorAll(selectors: string): NodeListOf<HTMLElement>;
  }
  interface Element {
    setAttribute(qualifiedName: string, value: boolean | number): void;
  }
  interface HTMLElement {
    hass: any;
    stateObj: any;
    setConfig(config: any): void;
    muted: boolean;
    controls: boolean;
    allowExoPlayer: boolean;
    disabled: boolean;
  }
}

// the Automations methods, put on the prototype by `Object.assign(HomePanel.prototype, autoMethods)` in home-panel.js
declare module '../home-panel.js' {
  interface HomePanel {
    auAutos(): any[];
    auLoad(force?: boolean): Promise<void>;
    renderAuto(): void;
  }
}
