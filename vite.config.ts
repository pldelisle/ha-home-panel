import {defineConfig, type Plugin} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import pkg from './package.json' with {type: 'json'};

// One minified ES module, dist/home-panel.js, with its source map beside it. The CSS is imported as text
// (src/styles.js) and the version is injected here, from package.json. ApexCharts and Mermaid come from npm through
// dynamic imports, so they are emitted as lazy chunks under dist/chunks/, fetched when a tab first needs them. What is
// left in vendor/ (Leaflet, unused, until spec 07 removes it) is copied next to the entry.

// The constants the build replaces in src/ (declared in src/env.d.ts); vitest.config.ts uses the same object.
export const define = {__VERSION__: JSON.stringify(pkg.version)};

// Every chunk with code keeps its map, so a stack trace from a chart or a flow names the file and line it came from,
// but the maps leave out the libraries' own text: with it they were 9.9 MB for Mermaid alone and nearly tripled the
// release zip. The panel's own files keep their text, in home-panel.js.map and in any chunk.
const chunkMapsWithoutLibrarySources: Plugin = {
  name: 'chunk-maps-without-library-sources',
  generateBundle(_, bundle) {
    for (const f of Object.values(bundle))
      if (f.type === 'asset' && /^chunks\/.+\.js\.map$/.test(f.fileName)) {
        const m = JSON.parse(String(f.source));
        m.sourcesContent = m.sources.map((s: string, i: number) =>
          s.includes('node_modules/') ? null : (m.sourcesContent?.[i] ?? null),
        );
        f.source = JSON.stringify(m);
      }
  },
};

export default defineConfig({
  define,
  build: {
    lib: {entry: 'src/main.js', formats: ['es'], fileName: () => 'home-panel.js'},
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'oxc', // Vite 8's default; `esbuild` would need the esbuild package as well
    target: 'es2020',
    rolldownOptions: {
      // apexcharts.esm.js is an ES module that also carries a `typeof module` test (inside its bundled svg.js), which
      // Rolldown warns about on every build; the test is what makes it behave as the <script> build did (see spec 07)
      onwarn(warning, defaultHandler) {
        if (warning.code === 'COMMONJS_VARIABLE_IN_ESM' && String(warning.message).includes('node_modules/apexcharts/'))
          return;
        defaultHandler(warning);
      },
      output: {
        // library mode keeps an ES entry's whitespace so that the consumer's bundler can still shake it; this entry is
        // the final file Home Assistant loads, so it is minified all the way
        minify: {codegen: true},
        // the libraries' licence comments (/*! … */, @license) stay in their chunks, as in the files from vendor/
        comments: {legal: true},
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    viteStaticCopy({targets: [{src: 'vendor/*.{js,css}', dest: '.', rename: {stripBase: 1}}]}),
    chunkMapsWithoutLibrarySources,
  ],
});
