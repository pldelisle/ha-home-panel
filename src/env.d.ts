// Ambient declarations for the build: the constant Vite injects and the suffix it imports as text.
// The loose pass over the legacy files has more, in src/legacy/dom-scaffolding.d.ts.

// Constants that vite.config.ts (and vitest.config.ts) replace at build time.
declare const __VERSION__: string;

// Vite's `?raw` suffix imports a file's text (src/styles.js reads the files in src/css/ this way).
declare module '*.css?raw' {
  const css: string;
  export default css;
}
