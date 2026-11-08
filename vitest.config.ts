import {defineConfig} from 'vitest/config';

// Unit tests only: Playwright's specs live in test/e2e and are run by playwright.config.ts, which only matches *.spec.ts.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.{mjs,ts}'],
    environment: 'node',
    coverage: {provider: 'v8', include: ['src/config.js', 'src/stack.js'], reporter: ['text', 'html']},
  },
});
