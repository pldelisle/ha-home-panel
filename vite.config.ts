import {defineConfig} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import pkg from './package.json' with {type: 'json'};

// One minified ES module, dist/home-panel.js, with its source map beside it. The CSS is imported as text
// (src/styles.js) and the version is injected here, from package.json. The vendored libraries are copied next to the
// entry: the panel loads them at run time with loadScript(BASE + …), so they are not part of the bundle.

// The constants the build replaces in src/ (declared in src/env.d.ts); vitest.config.ts uses the same object.
export const define = {__VERSION__: JSON.stringify(pkg.version)};

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
      output: {
        // library mode keeps an ES entry's whitespace so that the consumer's bundler can still shake it; this entry is
        // the final file Home Assistant loads, so it is minified all the way
        minify: {codegen: true},
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [viteStaticCopy({targets: [{src: 'vendor/*.{js,css}', dest: '.', rename: {stripBase: 1}}]})],
});
