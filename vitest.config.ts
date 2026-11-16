// Unit tests only: Playwright's specs live in test/e2e and are run by playwright.config.ts,
// which only matches *.spec.ts.
import {defineConfig} from 'vitest/config';
import {define} from './vite.config';

export default defineConfig({
  define, // the build's own constants (src/shell/home-panel.ts reads __VERSION__), so the two configs cannot drift
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
        'src/features/*/{ids,inputs,model,speakers,tiles,history,scenes,commands,flow-layout,water-chart,charts,sankey-layout,schedule,bars-geometry,checks,order,state,al-strip-layout,traces,sentences,timeline-layout,graph,mermaid-def}.ts', // the pure files; the elements are proven by the harness
        'src/features/car/loader.ts', // a controller over the statistics cache, tested with a fake cache, store and host; the pane that mounts it is proven by the harness
        'src/features/climate/sender.ts', // a controller over the overlay and the runner, tested with fakes and a fake clock; its two elements are proven by the harness
        'src/ui/{ranges,seg-keys,steps,thin-axis,toast-schedule}.ts', // the kit's pure files; its elements are proven by the harness
        'src/ui/commands.ts', // the command layer: the runner, the store and its controller are tested with fakes (ADR 0023)
        'src/ui/overlay-store.ts',
        'src/ui/controllers/{optimistic,armed,windowed-history}.ts',
        'src/ui/styles/host.ts',
        'src/shell/guest.ts',
        'src/shell/features.ts',
        'src/shell/idle-timer.ts', // the table and its controller; the host is a stub, no element is mounted
        'src/shell/legacy-feature.ts',
        'src/shell/sky.ts',
        'src/shell/appearance-rules.ts',
        'src/shell/document-background.ts',
        'src/ui/icons.ts',
        'src/ui/events.ts',
        'src/ui/lens.ts',
        'scripts/lib/anonymise.mjs',
      ],
      // the one module that names the library is loaded by the lazy chunk and proved by chunks.spec.ts, not here
      exclude: ['src/core/apex-lib.ts'],
      reporter: [['text', {skipFull: false}], 'html'], // skipFull false lists the files at 100 percent too
      // the phase-2 gate: every statement in the core is tested (CI runs `npm test -- --coverage`); phase 3 holds the providers,
      // each feature's model, ids, inputs, tiles and history, and the kit's ranges to the same line
      thresholds: {
        'src/core/**/*.ts': {statements: 100},
        'src/providers/**/*.ts': {statements: 100},
        'src/features/*/{ids,inputs,model,speakers,tiles,history,scenes,commands,flow-layout,water-chart,charts,sankey-layout,schedule,bars-geometry,checks,order,state,al-strip-layout,traces,sentences,timeline-layout,graph,mermaid-def}.ts':
          {
            statements: 100,
          },
        'src/features/car/loader.ts': {statements: 100},
        'src/features/climate/sender.ts': {statements: 100},
        'src/ui/ranges.ts': {statements: 100},
        'src/ui/seg-keys.ts': {statements: 100},
        'src/ui/steps.ts': {statements: 100},
        'src/ui/thin-axis.ts': {statements: 100},
        'src/ui/toast-schedule.ts': {statements: 100},
        'src/ui/commands.ts': {statements: 100},
        'src/ui/overlay-store.ts': {statements: 100},
        'src/ui/controllers/optimistic.ts': {statements: 100},
        'src/ui/controllers/armed.ts': {statements: 100},
        'src/ui/controllers/windowed-history.ts': {statements: 100},
        'src/ui/styles/host.ts': {statements: 100},
        'src/shell/guest.ts': {statements: 100},
        'src/shell/features.ts': {statements: 100},
        'src/shell/idle-timer.ts': {statements: 100, branches: 100},
        'src/shell/legacy-feature.ts': {statements: 100},
        'src/shell/sky.ts': {statements: 100},
        'src/shell/appearance-rules.ts': {statements: 100},
        'src/shell/document-background.ts': {statements: 100},
        'src/ui/icons.ts': {statements: 100},
        'src/ui/events.ts': {statements: 100},
        'src/ui/lens.ts': {statements: 100},
        'scripts/lib/anonymise.mjs': {statements: 100},
      },
    },
  },
});
