// The build: every placeholder filled once, a valid ES module, and nothing from one particular house inside
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from '../../build.mjs';

const out = mkdtempSync(join(tmpdir(), 'home-panel-'));
const r = build('9.9.9-test', out);
const js = readFileSync(join(out, 'home-panel.js'), 'utf8');

test('the bundle carries the version and no placeholder', () => {
  assert.equal(r.version, '9.9.9-test');
  assert.match(js, /const VERSION = "9\.9\.9-test";/);
  for (const m of ['__CSS__', '__VERSION__', '/*__FR__*/', '/*__AUTO__*/', '/*__CONFIG__*/']) assert.ok(!js.includes(m), m);
});

test('the bundle parses as an ES module', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', join(out, 'home-panel.js')], {stdio: 'pipe'}));
});

test('the vendored libraries are copied next to it', () => {
  for (const f of ['apexcharts.min.js', 'apexcharts.css', 'leaflet.js', 'leaflet.css', 'mermaid.min.js']) assert.ok(existsSync(join(out, f)), f);
});

test('no personal data: names, places, a house photo or house-specific entity ids', () => {
  const src = ['src/home-panel.src.js', 'src/config.js', 'src/auto.js', 'src/i18n/fr.js', 'src/i18n/fr-map.js', 'test/e2e/harness.html', 'test/e2e/automations.json',
    'test/e2e/houses.ts', 'test/e2e/fixtures.ts', 'test/e2e/tabs.spec.ts']
    .map(f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8')).join('\n') + js;
  const banned = [/pierre/i, /genevi[eè]ve/i, /\bmilan\b/i, /delisle/i, /mascouche/i, /montr[eé]al/i, /data:image\/(webp|png|jpe?g)/i,
    /\b10\.0\.\d+\.\d+\b/, /\b192\.168\.\d+\.\d+\b/, /meter00|calypso|pulsar_plus|ac_uty_|hydro_quebec_maison|thermostat_chambre/i];
  for (const re of banned) { const m = src.match(re); assert.equal(m, null, `found ${re}: …${m && src.slice(Math.max(0, m.index - 40), m.index + 40)}…`); }
});
