// Lints the built bundle as the one module it is, so a dead top-level name in a spliced file is caught (the
// per-file config cannot see that: it treats top-level names in the spliced files as used). Run by `npm run check`.
// Goes away with the splicing (#33).
import {defineConfig} from 'eslint/config';
import globals from 'globals';

export default defineConfig({
  files: ['dist/home-panel.js'],
  languageOptions: {ecmaVersion: 2022, sourceType: 'module', globals: globals.browser},
  rules: {'no-undef': 'error', 'no-unused-vars': ['error', {vars: 'all'}]},
});
