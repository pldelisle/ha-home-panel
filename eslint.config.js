import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import lit from 'eslint-plugin-lit';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Read-only globals for names that live in another spliced file.
const readonly = names => Object.fromEntries(names.map(n => [n, 'readonly']));

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'vendor/', // third-party libraries, copied as shipped
      'test/e2e/__screenshots__/',
      'playwright-report/',
      'test-results/',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'module', globals: {...globals.browser, ...globals.node}},
  },
  // string rendering is banned everywhere except the two legacy files
  {
    files: ['**/*.js', '**/*.mjs', '**/*.ts'],
    ignores: ['src/home-panel.src.js', 'src/auto.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Render with Lit templates, not innerHTML.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Render with Lit templates, not insertAdjacentHTML.',
        },
      ],
    },
  },

  // The spliced files. build.mjs pastes config.js, stack.js, i18n/fr.js, i18n/fr-map.js and auto.js into
  // src/home-panel.src.js, so in the bundle they share one scope with it. They are plain scripts: no import, no export.
  // Each block below lists the names a file takes from the others. This list is the inventory that #33 turns into
  // imports; when a name becomes an import, delete it here.
  {
    files: ['src/config.js', 'src/stack.js', 'src/i18n/fr.js', 'src/i18n/fr-map.js', 'src/auto.js'],
    languageOptions: {sourceType: 'script'},
    rules: {
      // a top-level function or constant is how a spliced file hands a name to the others (and to the unit tests)
      'no-unused-vars': ['error', {vars: 'local'}],
    },
  },
  // config.js and stack.js use nothing from the other files (the unit tests run them alone)
  {
    files: ['src/i18n/fr.js'],
    languageOptions: {
      globals: readonly([
        'hass', // home-panel.src.js
        'FR_MAP', // fr-map.js
        'FR_LOW', // fr-map.js
        'FR_RX', // fr-map.js
      ]),
    },
  },
  {
    files: ['src/i18n/fr-map.js'],
    languageOptions: {globals: readonly(['frLook', 'frOr', 'frWd', 'frMo'] /* fr.js */)},
  },
  {
    files: ['src/auto.js'],
    languageOptions: {
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
        'VERSION', // all from home-panel.src.js
      ]),
    },
  },
  // home-panel.src.js is the one real module (import.meta), and takes from the spliced files
  {
    files: ['src/home-panel.src.js'],
    languageOptions: {
      globals: {
        ...readonly([
          '__CSS__', // replaced by build.mjs with the bundled CSS
          'resolveConfig', // config.js
          'pickStack', // stack.js
          'inHours', // stack.js
          'reminderLeft', // stack.js
          'FR_ATTR', // fr.js
          'frNode', // fr.js
          'frTree', // fr.js
          'frApex', // fr.js
          'AUTO', // auto.js
        ]),
        FR: 'writable', // declared in fr.js, set here once the language is known
      },
    },
  },

  // legacy: rules that fire on idioms in the old class; each entry says why; this block only shrinks
  {
    name: 'legacy',
    files: ['src/home-panel.src.js', 'src/auto.js'],
    rules: {
      // vars: top-level names of the spliced files are used from the other files (see above); caughtErrors: `catch (e) {}`
      // is the idiom for a best-effort call (storage, a JSON parse, a library that may not load), the error is never read
      'no-unused-vars': ['error', {vars: 'local', caughtErrors: 'none'}],
      // same idiom: the empty `catch {}` is deliberate
      'no-empty': ['error', {allowEmptyCatch: true}],
    },
  },

  // TypeScript and Lit
  ...tseslint.configs.recommendedTypeChecked.map(c => ({...c, files: ['**/*.ts']})),
  {files: ['**/*.ts'], languageOptions: {parserOptions: {projectService: true}}},
  {files: ['**/*.ts'], ...lit.configs['flat/recommended']},
  prettier,
);
