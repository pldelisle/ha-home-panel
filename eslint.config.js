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
// Code that runs in Node: the tools, the tests and the config files at the root (vite.config.ts among them).
const NODE = ['scripts/**', '*.config.{js,mjs,ts}', 'test/**'];

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

  // The one constant the build injects (vite.config.ts `define`); every other cross-file name is an import now
  {files: ['src/**/*.js'], languageOptions: {globals: {__VERSION__: 'readonly'}}},

  // Imports must resolve, and a name imported from a module must be one it exports (a misspelled import is an error
  // here, not a blank screen on the tablet). Vite's `?raw` suffix is not part of the file name, so those are skipped.
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
      'import-x/no-unresolved': ['error', {ignore: ['\\?raw$']}],
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

  // TypeScript and Lit
  {
    files: TS,
    extends: [tseslint.configs.recommendedTypeChecked, lit.configs['flat/recommended']],
    languageOptions: {parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname}},
  },
  prettier,
);
