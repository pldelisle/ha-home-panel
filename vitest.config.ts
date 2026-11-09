// Unit tests only: Playwright's specs live in test/e2e and are run by playwright.config.ts,
// which only matches *.spec.ts.
import {defineConfig} from 'vitest/config';
import {define} from './vite.config';

export default defineConfig({
  define, // the build's own constants (src/legacy/globals.js reads __VERSION__), so the two configs cannot drift
  test: {
    include: ['test/unit/**/*.test.{mjs,ts}'],
    environment: 'node',
    benchmark: {include: ['test/bench/**/*.bench.ts']},
    coverage: {
      provider: 'v8',
      include: ['src/stack.js', 'src/fonts.js', 'src/core/**/*.ts', 'src/shell/guest.ts', 'scripts/lib/anonymise.mjs'],
      reporter: [['text', {skipFull: false}], 'html'], // skipFull false lists the files at 100 percent too
      // the phase-2 gate: every statement in the core is tested (CI runs `npm test -- --coverage`)
      thresholds: {
        'src/core/**/*.ts': {statements: 100},
        'src/shell/guest.ts': {statements: 100},
        'scripts/lib/anonymise.mjs': {statements: 100},
      },
    },
  },
});
