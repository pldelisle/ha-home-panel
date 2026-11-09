import {defineConfig, type Plugin} from 'vite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import pkg from './package.json' with {type: 'json'};
import {FONT_FILES} from './src/fonts.js';

// One minified ES module, dist/home-panel.js, with its source map beside it. The CSS is imported as minified text
// (`?inline`, src/styles.js) and the version is injected here, from package.json. ApexCharts and Mermaid come from npm
// through dynamic imports, so they are emitted as lazy chunks under dist/chunks/, fetched when a tab first needs them. The
// generated LICENSES.md (npm run licenses) is emitted beside the entry, so the release zip carries the libraries'
// licences, and the Montserrat files go to dist/fonts/. Nothing else is copied: there is no vendor/ directory.

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
        const m = JSON.parse(String(f.source)) as {sources: string[]; sourcesContent?: (string | null)[]};
        m.sourcesContent = m.sources.map((s, i) =>
          s.includes('node_modules/') ? null : (m.sourcesContent?.[i] ?? null),
        );
        f.source = JSON.stringify(m);
      }
  },
};

// LICENSES.md, generated at the root and committed, goes into dist/ and so into the release zip and a manual install
// (HACS copies the zip's files too). test/unit/licenses.test.mjs fails when the file is out of date.
const licensesPath = fileURLToPath(new URL('./LICENSES.md', import.meta.url));
const shipLicenses: Plugin = {
  name: 'ship-licenses',
  buildStart() {
    this.addWatchFile(licensesPath);
  },
  generateBundle() {
    this.emitFile({type: 'asset', fileName: 'LICENSES.md', source: readFileSync(licensesPath, 'utf8')});
  },
};

// Montserrat (spec 08): the eight woff2 files src/fonts.js declares, copied from @fontsource/montserrat into
// dist/fonts/ under Fontsource's own names. Not imported through CSS, where Vite would inline or hash them: the names
// stay stable, so a tablet's cached font outlives an update, and src/fonts.js can name them.
const requireFontsource = createRequire(import.meta.url);
const shipFonts: Plugin = {
  name: 'ship-fonts',
  generateBundle() {
    for (const file of FONT_FILES)
      this.emitFile({
        type: 'asset',
        fileName: `fonts/${file}`,
        source: readFileSync(requireFontsource.resolve(`@fontsource/montserrat/files/${file}`)),
      });
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
    // The stylesheet (`?inline` in src/styles.js) is minified by Lightning CSS, named here so that a change of Vite's
    // default cannot switch the minifier. The targets are the browser floor, Safari and iOS 26 and current Chrome, Edge
    // and Firefox (README, Browser support): Lightning CSS drops the vendor prefixes they do not need. Why, and what it
    // does to the rules: spec 06, As built (#69); test/unit/styles.test.mjs guards it.
    cssMinify: 'lightningcss',
    cssTarget: ['safari26', 'ios26', 'chrome140', 'edge140', 'firefox140'],
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
        // the libraries' licence comments (/*! … */, @license) stay in their chunks
        comments: {legal: true},
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [shipLicenses, shipFonts, chunkMapsWithoutLibrarySources],
});
