// Ambient declarations for the build: the constant Vite injects and the suffix it imports minified CSS as text with.
// The loose pass over the legacy files has more, in src/legacy/dom-scaffolding.d.ts.

// Constants that vite.config.ts (and vitest.config.ts) replace at build time.
declare const __VERSION__: string;

// Vite's `?inline` suffix imports a stylesheet, minified, as a string (src/styles.js reads src/css/ this way).
declare module '*.css?inline' {
  const css: string;
  export default css;
}

// Mermaid as the Automations' flow mount calls it (src/features/automations/flow-mount.ts), by its ESM file: the package's own
// types import `type-fest`, which the panel does not install. Same file as `import('mermaid')`, so the same lazy chunks.
declare module 'mermaid/dist/mermaid.core.mjs' {
  const mermaid: {
    initialize(config: object): void;
    render(id: string, definition: string): Promise<{svg: string}>;
  };
  export default mermaid;
}
