// End-to-end smoke test: loads dist/home-panel.js in Chromium with a made-up house, opens every tab on a tablet and a phone,
// and fails on any page error, on a tab that doesn't show, or on an optional section that shows without its entities.
// Screenshots land in test/e2e/out/ for a look. Run: npm run test:e2e
import {chromium} from 'playwright';
import http from 'node:http';
import {createReadStream, existsSync, mkdirSync} from 'node:fs';
import {dirname, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url)), DIST = join(HERE, '..', '..', 'dist'), OUT = join(HERE, 'out');
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u.startsWith('/panel/') ? join(DIST, u.slice(7)) : join(HERE, u === '/' ? 'harness.html' : u);
  if (!f.startsWith(DIST) && !f.startsWith(HERE) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': MIME[extname(f)] || 'application/octet-stream'}); createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, r));
const BASE = `http://localhost:${srv.address().port}/`;
mkdirSync(OUT, {recursive: true});

// the full test house names its energy devices in the config, the way a real install would
const FULL_CFG = {
  people: ['Alex', 'Sam'],
  entities: {grid_power: 'sensor.house_power', water_heater_power: 'sensor.water_heater_power', water_heater_temperature: 'sensor.water_heater_temperature',
    ev_charger_power: 'sensor.charger_power', ev_charger_status: 'sensor.charger_status', ev_charger_current: 'number.charger_max_current',
    ev_charger_pause: 'switch.charger_pause', ev_charger_lock: 'lock.charger_lock'},
  scenes: ['scene.dinner', 'scene.movie_night'], modes: ['input_boolean.kids_bedtime'], car: {color: '#B03A2E'},
};
const TABLET = ['home', 'lights', 'climate', 'weather', 'car', 'energy', 'air', 'media', 'cams', 'auto'], PHONE = ['home', 'lights', 'climate', 'car'];
const browser = await chromium.launch();
let failures = 0;
async function run(name, {house, cfg, viewport, lang = 'en', theme = 'light', check}) {
  const page = await browser.newPage({viewport, deviceScaleFactor: 1, timezoneId: 'America/Toronto', reducedMotion: 'reduce'});
  const errors = []; let at = 'load';
  page.on('pageerror', e => errors.push(`[${at}] ` + e.message + (process.env.STACK ? '\n' + e.stack : '')));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.googleapis/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(([c, t]) => { window.PANEL_CFG = c; try { localStorage.setItem('home-panel-theme', t); } catch (e) {} }, [cfg || null, theme]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  try {
    await page.goto(`${BASE}?house=${house}&lang=${lang}`);
    await page.waitForFunction(() => document.querySelector('home-panel')?.shadowRoot?.getElementById('rail'));
    const R = fn => page.evaluate(fn);
    for (const t of viewport.width < 600 ? PHONE : TABLET) {
      const shown = await page.evaluate(t => { const r = document.querySelector('home-panel').shadowRoot, b = r.querySelector(`[data-tab="${t}"]`); if (!b || b.hidden) return null; b.click(); return true; }, t);
      if (!shown) continue;
      at = t;   // a tab hidden on purpose (no car, say)
      await page.waitForTimeout(t === 'auto' ? 2500 : 700);
      const vis = await page.evaluate(t => { const p = document.querySelector('home-panel').shadowRoot.getElementById('pane-' + t); return p && !p.hidden && p.getBoundingClientRect().height > 50; }, t);
      assert.ok(vis, `${name}: the ${t} pane didn't show`);
      await page.screenshot({path: join(OUT, `${name}-${t}.png`)});
    }
    // nothing invisible may sit on top of the panel and swallow taps (the v1.19.6 idle overlay did)
    const top = await R(() => { const r = document.querySelector('home-panel').shadowRoot, b = r.querySelector('[data-tab="home"]'), x = b.getBoundingClientRect(); const e = r.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2); return !!e && (e === b || b.contains(e)); });
    assert.ok(top, `${name}: the Home tab button is covered by another element`);
    if (check) await check(page);
    assert.deepEqual(errors, [], `${name}: page errors`);
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++; console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`);
  } finally { await page.close(); }
}

const ipad = {width: 1180, height: 820}, iphone = {width: 393, height: 852};
const q = (page, sel) => page.evaluate(s => [...document.querySelector('home-panel').shadowRoot.querySelectorAll(s)].map(e => ({hidden: e.hidden || getComputedStyle(e).display === 'none', text: e.textContent})), sel);

await run('full-ipad', {house: 'full', cfg: FULL_CFG, viewport: ipad, check: async page => {
  const who = (await q(page, '.who, #who, .pill')).map(x => x.text).join(' ');
  assert.ok(/Alex/.test(await page.evaluate(() => document.querySelector('home-panel').shadowRoot.textContent)), 'who\'s home lists the configured people');
  assert.ok(!(await q(page, '#water'))[0].hidden, 'the water heater card shows when its sensors are set');
  assert.ok((await q(page, '#hilo'))[0].hidden, 'the Hilo card stays hidden without Hilo');
  assert.ok(!(await q(page, '#rail [data-tab="car"]'))[0].hidden, 'the car tab shows when a FordPass car exists');
}});
await run('full-ipad-dark', {house: 'full', cfg: FULL_CFG, viewport: ipad, theme: 'dark'});
await run('full-ipad-fr', {house: 'full', cfg: FULL_CFG, viewport: ipad, lang: 'fr', check: async page => {
  const txt = await page.evaluate(() => document.querySelector('home-panel').shadowRoot.getElementById('rail').textContent);
  assert.match(txt, /Accueil|Lumières|Climat/, 'the rail is in French for a French-language user');
}});
await run('full-iphone', {house: 'full', cfg: FULL_CFG, viewport: iphone});
await run('bare-ipad', {house: 'bare', viewport: ipad, check: async page => {
  for (const sel of ['#water', '#hilo', '#rail [data-tab="car"]', '#rail [data-tab="climate"]']) assert.ok((await q(page, sel)).every(x => x.hidden), `${sel} stays hidden in a house without it`);
}});
await run('bare-iphone', {house: 'bare', viewport: iphone});

await browser.close(); srv.close();
if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall smoke tests passed');
