// The layer table of docs/specs/09-architecture-foundations.md as `forbidden` rules: dependencies point inward, toward
// the core (Martin's Dependency Rule, 2017). One rule per row, each with the reason it exists. The folders of phase 3
// do not exist yet; their rules name them so they are enforced from the first file. The shell (src/shell/ and
// src/main.js) is the composition root and has no row of its own: it may import everything, and the rows above and
// below are what keep every other layer from importing it.
const CORE = '^src/core/';
const PROVIDERS = '^src/providers/';
const UI = '^src/ui/';
const ENTRY = '^src/main\\.js$';
const FEATURES = '^src/features/';
// the kit's stylesheets: plain text with no imports, which the legacy sheet joins (src/styles.js) and the elements adopt (ADR 0019)
const KIT_STYLES = '^src/ui/styles/[^/]+\\.css$';
// the strangler's host, shared with scripts/arch-graph.mjs and test/unit/architecture.test.mjs
const {LEGACY} = require('./scripts/legacy-set.cjs');

module.exports = {
  forbidden: [
    {
      name: 'core-only-imports-core',
      severity: 'error',
      comment:
        'The core is the functional core: it imports itself and npm packages, so it can be tested in Node with nothing else running.',
      from: {path: CORE},
      to: {path: '^src/', pathNot: CORE},
    },
    {
      name: 'providers-import-core-only',
      severity: 'error',
      comment:
        'A provider adapts one source of data to the core. It must not know the screens, the UI kit, the shell or the legacy code that consume it.',
      from: {path: PROVIDERS},
      to: {path: '^src/', pathNot: [PROVIDERS, CORE]},
    },
    {
      name: 'ui-kit-imports-core-only',
      severity: 'error',
      comment:
        'The UI kit is shared by every feature, so it may not depend on one of them, on a provider, on the shell or on legacy code.',
      from: {path: UI},
      to: {path: '^src/', pathNot: [UI, CORE]},
    },
    {
      name: 'features-import-inward-only',
      severity: 'error',
      comment:
        'A feature may use the core, the UI kit and the providers. It must not reach the shell that composes it or the legacy code it replaces.',
      from: {path: FEATURES},
      to: {path: '^src/', pathNot: [FEATURES, CORE, UI, PROVIDERS]},
    },
    {
      name: 'features-not-each-other',
      severity: 'error',
      comment:
        'A feature folder can be moved or deleted on its own only if no other feature imports it. Shared code goes down to the UI kit or the core.',
      from: {path: '^src/features/([^/]+)/'},
      to: {path: FEATURES, pathNot: '^src/features/$1/'},
    },
    {
      name: 'legacy-imports-core-and-legacy-only',
      severity: 'error',
      comment:
        "Legacy code is being strangled: it may use the new core, but it must not grow dependencies on the new features, UI kit, providers or shell. The one exception is the kit's stylesheets, text the legacy sheet is made of (ADR 0019).",
      from: {path: LEGACY},
      to: {path: '^src/', pathNot: [LEGACY, CORE, KIT_STYLES]},
    },
    {
      name: 'nothing-imports-legacy-but-entry',
      severity: 'error',
      comment:
        'Nothing new may depend on legacy code, or it can never be deleted. Only the entry, src/main.js, which composes the app, may.',
      from: {path: '^src/', pathNot: [LEGACY, ENTRY]},
      to: {path: LEGACY},
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle cannot be loaded, tested or moved one module at a time.',
      from: {},
      to: {circular: true},
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'A module nothing imports is dead code. The entry and declaration files are the exceptions.',
      from: {orphan: true, pathNot: [ENTRY, '\\.d\\.ts$']},
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'An import that points nowhere breaks the build. Vite `?inline` CSS imports are resolved by Vite.',
      from: {},
      to: {couldNotResolve: true, pathNot: '\\?inline$'},
    },
  ],
  options: {
    tsConfig: {fileName: 'tsconfig.json'},
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.js', '.mjs', '.ts', '.d.ts'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'module', 'default'],
    },
    doNotFollow: {path: 'node_modules'},
  },
};
