// Unit tests only: Playwright's specs live in test/e2e and are run by playwright.config.ts,
// which only matches *.spec.ts.
import {defineConfig} from 'vitest/config';
import {define} from './vite.config';

export default defineConfig({
  define, // the build's own constants (src/legacy/globals.js reads __VERSION__), so the two configs cannot drift
  test: {
    include: ['test/unit/**/*.test.{mjs,ts}'],
    environment: 'node',
    coverage: {provider: 'v8', include: ['src/config.js', 'src/stack.js'], reporter: ['text', 'html']},
  },
});
