// Unit tests only: Playwright's specs live in test/e2e and are run by playwright.config.ts,
// which only matches *.spec.ts.
import {defineConfig} from 'vitest/config';
import pkg from './package.json' with {type: 'json'};

export default defineConfig({
  define: {__VERSION__: JSON.stringify(pkg.version)}, // as in vite.config.ts: src/legacy/globals.js reads it
  test: {
    include: ['test/unit/**/*.test.{mjs,ts}'],
    environment: 'node',
    coverage: {provider: 'v8', include: ['src/config.js', 'src/stack.js'], reporter: ['text', 'html']},
  },
});
