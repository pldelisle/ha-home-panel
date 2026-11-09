import js from '@eslint/js';
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';
import lit from 'eslint-plugin-lit';
import {importX, createNodeResolver} from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const TS = ['**/*.ts'];
// The two files the old string-rendering code lives in; the `legacy` block below only shrinks.
const LEGACY = ['src/home-panel.js', 'src/auto.js'];
// The one file that may call Home Assistant's socket: the API client (docs/specs/12-api-client.md, ADR 0014).
const API_CLIENT = 'src/core/api.ts';
// Code that runs in Node: the tools, the tests and the config files at the root (vite.config.ts among them).
const NODE = ['scripts/**', '*.config.{js,mjs,ts}', 'test/**'];

const STRING_RENDERING = [
  {
    // both `el.innerHTML = x` and `el['innerHTML'] = x`
    selector:
      ':matches(AssignmentExpression[left.property.name="innerHTML"], AssignmentExpression[left.property.value="innerHTML"])',
    message: 'Render with Lit templates, not innerHTML.',
  },
  {
    selector:
      ':matches(CallExpression[callee.property.name="insertAdjacentHTML"], CallExpression[callee.property.value="insertAdjacentHTML"])',
    message: 'Render with Lit templates, not insertAdjacentHTML.',
  },
];
// Any way of reaching one of the four socket functions: `hass.callWS(...)`, `hass['callWS'](...)`, a template literal
// key, `hass.callWS.call(...)` and `.apply`/`.bind` (all member accesses) and `const {callWS} = hass` (a destructuring
// pattern, key written as a name or a string). A key computed at run time (`hass[name]`) no selector can see.
const SOCKET = '/^(callWS|callService|subscribeMessage|subscribeEvents)$/';
const API_DOOR = {
  selector: [
    `MemberExpression[property.name=${SOCKET}]`,
    `MemberExpression[property.value=${SOCKET}]`,
    `MemberExpression > TemplateLiteral.property[quasis.0.value.cooked=${SOCKET}]`,
    `ObjectPattern > Property[key.name=${SOCKET}]`,
    `ObjectPattern > Property[key.value=${SOCKET}]`,
  ].join(', '),
  message: 'Call Home Assistant through the API client (src/core/api.ts).',
};

export default defineConfig(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'src/legacy/dom-scaffolding.d.ts', // declarations for tsconfig.legacy.json only; tsconfig.json excludes it, so the typed project cannot parse it
      'test/e2e/__screenshots__/',
      'playwright-report/',
      'test-results/',
      '.claude/', // agent worktrees hold their own copies of the repository
      'graphify-out/',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'module', globals: globals.browser},
    rules: {
      // `==` coerces; compare to null with `== null` only when both null and undefined are meant
      eqeqeq: ['error', 'always', {null: 'ignore'}],
    },
  },
  {files: NODE, languageOptions: {globals: globals.node}},

  // String rendering is banned everywhere except the legacy files.
  {
    files: ['**/*.js', '**/*.mjs', ...TS],
    ignores: LEGACY,
    rules: {'no-restricted-syntax': ['error', ...STRING_RENDERING]},
  },

  // Home Assistant's socket has one door, the API client. A rule's options are replaced, not merged, by a later block
  // that sets the same rule, so each kind of file below lists everything that applies to it: the legacy files (no
  // string-rendering ban) and the rest of src/ (both). The client itself keeps the string-rendering ban only.
  {files: LEGACY, rules: {'no-restricted-syntax': ['error', API_DOOR]}},
  {
    files: ['src/**/*.{js,ts}'],
    ignores: [...LEGACY, API_CLIENT],
    rules: {'no-restricted-syntax': ['error', ...STRING_RENDERING, API_DOOR]},
  },

  // The new layers draw with Lit templates only: not even a read of innerHTML or a call of insertAdjacentHTML (the
  // string-rendering ban above catches the writes; this one is the "no innerHTML outside legacy" convention of
  // docs/architecture.md as a lint, for the folders that hold no legacy code)
  {
    files: ['src/shell/**/*.ts', 'src/ui/**/*.ts', 'src/features/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {property: 'innerHTML', message: 'Render with Lit templates, not innerHTML.'},
        {property: 'insertAdjacentHTML', message: 'Render with Lit templates, not insertAdjacentHTML.'},
      ],
    },
  },

  // The one constant the build injects (vite.config.ts `define`); every other cross-file name is an import now
  {files: ['src/**/*.js'], languageOptions: {globals: {__VERSION__: 'readonly'}}},

  // Imports must resolve, and a name imported from a module must be one it exports (a misspelled import is an error
  // here, not a blank screen on the tablet). The resolver drops a `?inline` suffix, so a misspelled stylesheet path in
  // src/styles.js fails too.
  {
    files: ['src/**/*.{js,ts}', 'test/**/*.{js,mjs,ts}'],
    plugins: {'import-x': importX},
    settings: {
      // import-x/named reads a .ts file's exports with the same parser ESLint uses for it
      'import-x/parsers': {'@typescript-eslint/parser': ['.ts']},
      // the tests import their .ts helpers without an extension, as TypeScript and Playwright allow
      'import-x/resolver-next': [createNodeResolver({extensions: ['.js', '.mjs', '.ts', '.d.ts', '.json']})],
    },
    rules: {
      'import-x/no-unresolved': ['error'],
      // for .ts files too, through the parser setting above (`import {PHONE_TABZ} from './houses'` fails)
      'import-x/named': ['error'],
    },
  },

  // legacy: rules that fire on idioms in the old class; each entry says why; this block only shrinks
  {
    name: 'legacy',
    files: LEGACY,
    rules: {
      // `catch {}` is deliberate in the best-effort calls (storage, JSON.parse, a library that may not load)
      'no-empty': ['error', {allowEmptyCatch: true}],
    },
  },

  // The core has no DOM: a module that needs the time zone, the locale or a Storage accepts it as a parameter, which is
  // what lets Node test it with no browser (docs/specs/09-architecture-foundations.md, "Core has no DOM"). The core is
  // TypeScript only, hence the glob
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'location', 'customElements'].map(
          name => ({
            name,
            message: 'The core has no DOM: accept it as a parameter (docs/specs/09-architecture-foundations.md).',
          }),
        ),
      ],
    },
  },

  // TypeScript and Lit
  {
    files: TS,
    extends: [tseslint.configs.recommendedTypeChecked, lit.configs['flat/recommended']],
    languageOptions: {parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname}},
  },
  prettier,
);
