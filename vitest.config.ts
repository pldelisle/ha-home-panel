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
      // the elements and src/ui/controllers/** are humble objects, proven by the harness (ADR 0005), so they are not listed
      include: [
        'src/stack.js',
        'src/fonts.js',
        'src/core/**/*.ts',
        'src/providers/**/*.ts',
        'src/features/*/{ids,inputs,model,tiles}.ts', // the pure files; the elements are proven by the harness
        'src/shell/guest.ts',
        'src/shell/features.ts',
        'src/shell/legacy-feature.ts',
        'src/shell/sky.ts',
        'src/shell/appearance-rules.ts',
        'src/ui/icons.ts',
        'scripts/lib/anonymise.mjs',
      ],
      reporter: [['text', {skipFull: false}], 'html'], // skipFull false lists the files at 100 percent too
      // the phase-2 gate: every statement in the core is tested (CI runs `npm test -- --coverage`); phase 3 holds the providers and
      // each feature's model, ids, inputs and tiles to the same line
      thresholds: {
        'src/core/**/*.ts': {statements: 100},
        'src/providers/**/*.ts': {statements: 100},
        'src/features/*/{ids,inputs,model,tiles}.ts': {statements: 100},
        'src/shell/guest.ts': {statements: 100},
        'src/shell/features.ts': {statements: 100},
        'src/shell/legacy-feature.ts': {statements: 100},
        'src/shell/sky.ts': {statements: 100},
        'src/shell/appearance-rules.ts': {statements: 100},
        'src/ui/icons.ts': {statements: 100},
        'scripts/lib/anonymise.mjs': {statements: 100},
      },
    },
  },
});
