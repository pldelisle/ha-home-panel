import {defineConfig, type Plugin} from 'vite';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {brotliCompressSync, constants as zlib, gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import pkg from './package.json' with {type: 'json'};
import {FONT_SOURCES} from './src/ui/fonts.ts';

// One minified ES module, dist/main-[hash].js, with its source map beside it, which the one-line entry dist/home-panel.js imports (see `advancedChunks` below). The CSS is imported as minified text
// (`?inline`, src/styles.js) and the version is injected here, from package.json. ApexCharts and Mermaid come from npm
// through dynamic imports, so they are emitted as lazy chunks under dist/chunks/, fetched when a tab first needs
// them. The generated LICENSES.md (npm run licenses) is emitted beside the entry, so the release zip carries the
// libraries' licences, and the font files go to dist/fonts/. Each script gets a .br and a .gz copy
// (precompress, below). Nothing else is copied: there is no vendor/ directory.

// The constants the build replaces in src/ (declared in src/env.d.ts); vitest.config.ts uses the same object.
export const define = {__VERSION__: JSON.stringify(pkg.version)};

// Every chunk with code keeps its map, so a stack trace from a chart or a flow names the file and line it came from,
// but the maps leave out the libraries' own text: with it they were 9.9 MB for Mermaid alone and nearly tripled the
// release zip. The panel's own files keep their text, in home-panel.js.map and in any chunk. The entry's map is held
// to the same rule since intl-messageformat, a production library, is built into the entry.
const chunkMapsWithoutLibrarySources: Plugin = {
  name: 'maps-without-library-sources',
  generateBundle(_, bundle) {
    for (const f of Object.values(bundle))
      if (f.type === 'asset' && /^(chunks\/.+|home-panel|main-[\w-]+)\.js\.map$/.test(f.fileName)) {
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

// The fonts (spec 08): the woff2 files src/ui/fonts.ts declares, Manrope, Roboto Flex and JetBrains Mono, copied from their Fontsource
// packages into dist/fonts/ under Fontsource's own names. Not imported through CSS, where Vite would inline or hash them: the names
// stay stable, so a tablet's cached font outlives an update, and src/ui/fonts.ts can name them.
const requireFontsource = createRequire(import.meta.url);
const shipFonts: Plugin = {
  name: 'ship-fonts',
  generateBundle() {
    for (const [pkg, file] of FONT_SOURCES)
      this.emitFile({
        type: 'asset',
        fileName: `fonts/${file}`,
        source: readFileSync(requireFontsource.resolve(`${pkg}/files/${file}`)),
      });
  },
};

// A compressed copy beside every script: X.js.br and X.js.gz. Home Assistant serves <config>/www as /local through
// aiohttp's FileResponse, which looks for X.br then X.gz beside the file and sends the first whose encoding the request
// accepts (Content-Encoding, Vary: Accept-Encoding, and the Content-Type of X.js); without such a copy it sends the
// file uncompressed. There is no mtime check, so a stale copy would be served: README, Install, says to replace the
// whole folder. The `.map` files are left out because only DevTools fetch them. Written after the files are on disk
// (`writeBundle`), so the sourceMappingURL line is in what is compressed; gzip and brotli write no timestamp, so the
// output is reproducible. Spec 06, As built (#98); test/unit/dist.test.mjs decompresses every copy.
const precompress: Plugin = {
  name: 'precompress',
  writeBundle(options, bundle) {
    if (!options.dir) throw new Error('precompress: the build has no output directory');
    const {dir} = options;
    for (const name of Object.keys(bundle).filter(n => n.endsWith('.js'))) {
      const file = join(dir, name);
      const buf = readFileSync(file);
      writeFileSync(`${file}.gz`, gzipSync(buf, {level: 9}));
      writeFileSync(
        `${file}.br`,
        brotliCompressSync(buf, {
          params: {
            [zlib.BROTLI_PARAM_QUALITY]: 11,
            [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
            [zlib.BROTLI_PARAM_SIZE_HINT]: buf.length,
          },
        }),
      );
    }
  },
};

// what the shared file holds: the panel's own sources, and the runtime libraries they import (not ApexCharts or Mermaid, which are lazy chunks of their own)
const SRC = fileURLToPath(new URL('./src/', import.meta.url));
// ...except the entries of the lazy chunks and what only they hold: ApexCharts' door, and the Ask feature (its `sheets.ts` is the one file the shell imports, so it stays in the shared file)
const LAZY_SOURCES = /[\\/]src[\\/](?:core[\\/]apex-lib\.ts|features[\\/]ask[\\/](?!sheets\.ts))/;
const PANEL_LIBRARIES =
  /[\\/]node_modules[\\/](?:lit|lit-html|lit-element|@lit|superstruct|@formatjs|intl-messageformat|@material[\\/]material-color-utilities)[\\/]/;

export default defineConfig({
  define,
  build: {
    lib: {entry: 'src/main.js', formats: ['es'], fileName: () => 'home-panel.js'},
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'oxc', // Vite 8's default; `esbuild` would need the esbuild package as well
    // The browser floor as a language level: ES2025 is Vite's row for Safari 26, iOS 26, Chrome 136 and Firefox 138.
    // Not `esnext`, which is open-ended: a later Vite could emit syntax Safari 26 lacks. Why: spec 06, As built (#103).
    target: 'es2025',
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
        // The panel's own code, and the libraries it runs on (Lit, Superstruct, intl-messageformat, the Material colour utilities), are one file, dist/main-[hash].js, which the
        // entry (dist/home-panel.js) imports. The Ask feature is a lazy chunk of the panel's own code (spec 29, #538), so it imports the modules the entry holds, and a chunk
        // may not import the entry itself: Home Assistant loads `home-panel.js?v=…`, and `../home-panel.js` is another URL, a second copy of every module. So the shared
        // code lives in a file both import by the same URL. Left to Rolldown it would split the shared code across the entry and a second chunk, under chunks/.
        advancedChunks: {
          groups: [
            {
              name: 'main',
              test: (id: string) => (id.startsWith(SRC) && !LAZY_SOURCES.test(id)) || PANEL_LIBRARIES.test(id),
            },
          ],
        },
        // the shared file is beside the entry, so `import.meta.url` (the fonts' folder) and the chunks' URLs stay where they were
        chunkFileNames: chunk => (chunk.name === 'main' ? '[name]-[hash].js' : 'chunks/[name]-[hash].js'),
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [shipLicenses, shipFonts, chunkMapsWithoutLibrarySources, precompress],
});
