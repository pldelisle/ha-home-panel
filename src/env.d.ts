// Ambient declarations for tsconfig.legacy.json (and nothing else: the strict config does not include this file).

// `any` is the point of these declarations: the legacy files are not typed (phase 2 types them).
/* eslint-disable @typescript-eslint/no-explicit-any */

// Constants that vite.config.ts (and vitest.config.ts) replace at build time.
declare const __VERSION__: string;

// Vite's `?raw` suffix imports a file's text (src/styles.js reads the files in src/css/ this way).
declare module '*.css?raw' {
  const css: string;
  export default css;
}

// The vendored libraries put themselves on window when loadScript() has loaded them.
interface Window {
  ApexCharts: any;
  mermaid: any;
}

// Scaffolding for the legacy files, which are checked loosely on purpose (spec 06). They treat `event.target` and the
// result of `querySelector` as HTML elements, and set properties on the custom elements they create. These
// declarations say so once, so that the checker stays on what it is for in those files (an import that does not
// resolve, a name that is not defined) without a cast at each of a hundred sites. Phase 2 types the elements and
// deletes them.
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
