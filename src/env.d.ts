// Ambient declarations for the build: the constant Vite injects and the suffix it imports minified CSS as text with.
// The loose pass over the legacy files has more, in src/legacy/dom-scaffolding.d.ts.

// Constants that vite.config.ts (and vitest.config.ts) replace at build time.
declare const __VERSION__: string;

// Vite's `?inline` suffix imports a stylesheet, minified, as a string (src/styles.js reads src/css/ this way).
declare module '*.css?inline' {
  const css: string;
  export default css;
}
