// Ambient declarations for the build: the constant Vite injects and the suffixes it imports CSS as text with.
// The loose pass over the legacy files has more, in src/legacy/dom-scaffolding.d.ts.

// Constants that vite.config.ts (and vitest.config.ts) replace at build time.
declare const __VERSION__: string;

// Vite's `?inline` suffix imports a stylesheet, minified, as a string (src/styles.js reads src/css/ this way).
declare module '*.css?inline' {
  const css: string;
  export default css;
}

// Vite's `?raw` suffix imports a file's text as it is (src/charts/apex-lib.js reads ApexCharts' stylesheet this way).
declare module '*.css?raw' {
  const css: string;
  export default css;
}
