import js from '@eslint/js';
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';
import lit from 'eslint-plugin-lit';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const TS = ['**/*.ts'];
// The two files the old string-rendering code lives in; the `legacy` block below only shrinks.
const LEGACY = ['src/home-panel.src.js', 'src/auto.js'];
// build.mjs pastes these into src/home-panel.src.js, so in the bundle they share one scope with it.
const SPLICED = ['src/config.js', 'src/stack.js', 'src/i18n/fr.js', 'src/i18n/fr-map.js', 'src/auto.js'];
// Code that runs in Node: the build, the tools, the tests and the config files at the root.
const NODE = ['build.mjs', 'scripts/**', '*.config.{js,mjs,ts}', 'test/**'];

// Read-only globals for names that a file takes from another spliced file.
const readonly = names => Object.fromEntries(names.map(n => [n, 'readonly']));

export default defineConfig(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'vendor/', // third-party libraries, copied as shipped
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
    rules: {
      'no-restricted-syntax': [
        'error',
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
      ],
    },
  },

  // The spliced files are plain scripts: no import, no export. A top-level name is how one hands something to
  // the others (and to the unit tests), so `no-unused-vars` only checks local variables here.
  // The blocks below list the names each file takes from the others. This list is the inventory that #33
  // turns into imports; when a name becomes an import, delete it here.
  {files: SPLICED, languageOptions: {sourceType: 'script'}, rules: {'no-unused-vars': ['error', {vars: 'local'}]}},
  // config.js and stack.js use nothing from the other files (the unit tests run them alone)
  {
    files: ['src/i18n/fr.js'],
    languageOptions: {
      globals: readonly([
        'hass', // from home-panel.src.js
        'FR_MAP', // from fr-map.js
        'FR_LOW', // from fr-map.js
        'FR_RX', // from fr-map.js
      ]),
    },
  },
  {
    files: ['src/i18n/fr-map.js'],
    languageOptions: {globals: readonly(['frLook', 'frOr', 'frWd', 'frMo'])}, // all from fr.js
  },
  {
    files: ['src/auto.js'],
    languageOptions: {
      // all from home-panel.src.js
      globals: readonly([
        'hass',
        'TZ',
        'st',
        'cap',
        'plural',
        'esc',
        'localDay',
        'attr',
        'ok',
        'tile',
        'fmtDate',
        'loadScript',
        'BASE',
        'VERSION',
      ]),
    },
  },
  // home-panel.src.js is the one real module (it uses import.meta); it takes from the spliced files
  {
    files: ['src/home-panel.src.js'],
    languageOptions: {
      globals: {
        ...readonly([
          '__CSS__', // replaced by build.mjs with the bundled CSS
          'resolveConfig', // from config.js
          'pickStack', // from stack.js
          'inHours', // from stack.js
          'reminderLeft', // from stack.js
          'FR_ATTR', // from fr.js
          'frNode', // from fr.js
          'frTree', // from fr.js
          'frApex', // from fr.js
          'AUTO', // from auto.js
        ]),
        FR: 'writable', // declared in fr.js, assigned here once the language is known
      },
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

  // TypeScript and Lit
  {
    files: TS,
    extends: [tseslint.configs.recommendedTypeChecked, lit.configs['flat/recommended']],
    languageOptions: {parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname}},
  },
  prettier,
);
