// Builds dist/home-panel.js, one ES module HA loads through panel_custom, and copies the vendored libraries next to it.
// The CSS files, the French strings, the Automations tab and the config code are spliced into src/home-panel.src.js.
// Usage: node build.mjs [version]   (the version defaults to package.json's)
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
export const CSS_ORDER = ['base', 'extra', 'tabs', 'phone', 'glass', 'motion'];   // motion.css last: it overrides the others

export function build(version = JSON.parse(read('package.json')).version, out = join(ROOT, 'dist')) {
  let src = read('src/home-panel.src.js');
  const css = CSS_ORDER.map(n => read(`src/css/${n}.css`)).join('');
  const parts = {
    '/*__CONFIG__*/': read('src/config.js'),
    '/*__FR__*/': read('src/i18n/fr.js') + '\n' + read('src/i18n/fr-map.js'),
    '/*__AUTO__*/': read('src/auto.js'),
    '__CSS__': JSON.stringify(css),
    "'__VERSION__'": JSON.stringify(version),
  };
  for (const [mark, text] of Object.entries(parts)) {
    const n = src.split(mark).length - 1;
    if (n !== 1) throw new Error(`${mark} appears ${n} times in home-panel.src.js, expected once`);
    src = src.replace(mark, () => text);
  }
  mkdirSync(out, {recursive: true});
  writeFileSync(join(out, 'home-panel.js'), src);
  for (const f of readdirSync(join(ROOT, 'vendor'))) if (/\.(js|css)$/.test(f)) copyFileSync(join(ROOT, 'vendor', f), join(out, f));
  return {version, bytes: Buffer.byteLength(src)};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = build(process.argv[2]);
  console.log(`built home-panel ${r.version} (${(r.bytes / 1024).toFixed(0)} KB) → dist/`);
}
