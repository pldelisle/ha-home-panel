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
async function run(name, {house, cfg, viewport, lang = 'en', theme = 'light', time, check, init, query = ''}) {
  const page = await browser.newPage({viewport, deviceScaleFactor: 1, timezoneId: 'America/Toronto', reducedMotion: 'reduce'});
  const errors = [], calls = []; let at = 'load';
  page.on('pageerror', e => errors.push(`[${at}] ` + e.message + (process.env.STACK ? '\n' + e.stack : '')));
  page.on('console', m => { if (m.text().startsWith('SERVICE ')) calls.push(m.text().slice(8)); if (m.type() === 'error' && !/Failed to load resource|fonts\.googleapis/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(([c, t]) => { window.PANEL_CFG = c; try { localStorage.setItem('home-panel-theme', t); } catch (e) {} }, [cfg || null, theme]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (time) await page.clock.setFixedTime(new Date(time));
  try {
    if (init) await page.addInitScript(init);
    await page.goto(`${BASE}?house=${house}&lang=${lang}${query}`);
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
    if (check) await check(page, calls);
    assert.deepEqual(errors, [], `${name}: page errors`);
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++; console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`);
  } finally { await page.close(); }
}

const ipad = {width: 1180, height: 820}, iphone = {width: 393, height: 852};
const q = (page, sel) => page.evaluate(s => [...document.querySelector('home-panel').shadowRoot.querySelectorAll(s)].map(e => ({hidden: e.hidden || getComputedStyle(e).display === 'none', text: e.textContent})), sel);

await run('full-ipad', {house: 'full', cfg: FULL_CFG, viewport: ipad, check: async (page, calls) => {
  const who = (await q(page, '.who, #who, .pill')).map(x => x.text).join(' ');
  assert.ok(/Alex/.test(await page.evaluate(() => document.querySelector('home-panel').shadowRoot.textContent)), 'who\'s home lists the configured people');
  assert.ok(!(await q(page, '#water'))[0].hidden, 'the water heater card shows when its sensors are set');
  assert.ok((await q(page, '#hilo'))[0].hidden, 'the Hilo card stays hidden without Hilo');
  assert.ok(!(await q(page, '#rail [data-tab="car"]'))[0].hidden, 'the car tab shows when a FordPass car exists');
  // the TV buttons reach Home Assistant (1.19.9: they crashed on a removed method before sending anything)
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#rail [data-tab="media"]').click());
  await page.waitForTimeout(500);
  for (const k of ['mute', 'power']) await page.evaluate(k => document.querySelector('home-panel').shadowRoot.querySelector(`#pane-media button[data-tv="${k}"], button[data-tv="${k}"]`).click(), k);
  await page.waitForTimeout(500);
  assert.ok(calls.some(c => /^media_player\.volume_mute /.test(c)), `mute sends media_player.volume_mute (calls: ${calls.join('; ')})`);
  assert.ok(calls.some(c => /^media_player\.turn_off /.test(c)), `power sends media_player.turn_off (calls: ${calls.join('; ')})`);
  // the idle clock shows the outdoor condition's icon beside the time (2.2.0), and a tap still wakes the panel
  await page.evaluate(() => document.querySelector('home-panel').idleStart());
  await page.waitForTimeout(300);
  const wx = await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#iwrap .iclk2 .wxi')?.getAttribute('aria-label'));
  assert.equal(wx, 'Mainly sunny', 'the idle clock shows the icon for the Environment Canada condition');
  await page.evaluate(() => document.querySelector('home-panel').idleArm());
  await page.waitForTimeout(500);
}});
// live activities (2.5.0): the test car is charging, so the status chip is a pill; tapped, it shows the car's card above the Status checks
const pillCheck = async (page, calls) => {
  const R = fn => page.evaluate(fn);
  const pill = await R(() => { const b = document.querySelector('home-panel').shadowRoot.querySelector('#chips .attchip'); return b && {lap: b.classList.contains('lap'), text: b.textContent}; });
  assert.ok(pill && pill.lap && /64%/.test(pill.text), `the status chip turns into a charging pill (got ${JSON.stringify(pill)})`);
  await R(() => document.querySelector('home-panel').shadowRoot.querySelector('#chips .attchip').click());
  await page.waitForTimeout(300);
  const pop = await R(() => { const p = document.querySelector('home-panel').shadowRoot.getElementById('attpop'); return {open: !p.hidden, acts: p.querySelectorAll('.lact').length, status: !!p.querySelector('.lstat')}; });
  assert.deepEqual(pop, {open: true, acts: 1, status: true}, 'the popup shows one activity card and the Status checks');
  await R(() => document.querySelector('home-panel').shadowRoot.querySelector('#attpop [data-la="pause"]').click());
  await page.waitForTimeout(300);
  assert.ok(calls.some(c => /^switch\.turn_off .*charger_pause/.test(c)), `Pause charging turns the Wallbox switch off (calls: ${calls.join('; ')})`);
  // once charging stops and nothing needs attention, the spot is empty: no All clear chip (2.8.0)
  await R(() => { const P = document.querySelector('home-panel'); hass.states['sensor.fordpass_test_elvehcharging'] = {...hass.states['sensor.fordpass_test_elvehcharging'], state: 'NOT_READY'}; hass.states['sensor.fordpass_test_elvehplug'] = {...hass.states['sensor.fordpass_test_elvehplug'], state: 'DISCONNECTED'}; P.hass = {...hass}; P.renderLive(); });
  const back = await R(() => !!document.querySelector('home-panel').shadowRoot.querySelector('#chips .attchip'));
  assert.equal(back, false, 'with nothing running and nothing to check there is no status chip');
  // a door left open: the spot shows an attention pill that opens the Status checks
  await R(() => { const P = document.querySelector('home-panel'); hass.states['binary_sensor.front_door'] = {...hass.states['binary_sensor.front_door'], state: 'on', last_changed: new Date(Date.now() - 20 * 6e4).toISOString()}; P.hass = {...hass}; P.renderLive(); });
  const att = await R(() => { const b = document.querySelector('home-panel').shadowRoot.querySelector('#chips .attchip'); return b && b.textContent; });
  assert.match(att || '', /needs attention/, 'a status problem shows as an attention pill');
};
await run('pill-ipad', {house: 'full', cfg: FULL_CFG, viewport: ipad, check: pillCheck});
await run('pill-iphone', {house: 'full', cfg: FULL_CFG, viewport: iphone, check: pillCheck});
await run('full-ipad-dark', {house: 'full', cfg: FULL_CFG, viewport: ipad, theme: 'dark'});
await run('full-ipad-fr', {house: 'full', cfg: FULL_CFG, viewport: ipad, lang: 'fr', check: async page => {
  const txt = await page.evaluate(() => document.querySelector('home-panel').shadowRoot.getElementById('rail').textContent);
  assert.match(txt, /Accueil|Lumières|Climat/, 'the rail is in French for a French-language user');
}});
await run('full-iphone', {house: 'full', cfg: FULL_CFG, viewport: iphone});
// smart stack (2.5.0): at 11:30 pm the plugged-in car and the playing speaker take turns beside the idle clock; a tap on the car card opens the car
await run('stack-ipad', {house: 'full', cfg: FULL_CFG, viewport: ipad, time: '2026-11-07T23:30:00-05:00', check: async page => {
  const R = fn => page.evaluate(fn);
  await R(() => document.querySelector('home-panel').idleStart());
  await page.waitForTimeout(300);
  const ks = [];
  for (let i = 0; i < 2; i++) {
    ks.push(await R(() => { const r = document.querySelector('home-panel').shadowRoot; return [r.querySelector('#istk .sc')?.dataset.k, r.querySelectorAll('#istk .sdots i').length]; }));
    await page.clock.setFixedTime(new Date(Date.parse('2026-11-07T23:30:00-05:00') + 20000 * (i + 1)));
    await R(() => document.querySelector('home-panel').renderIdle());
  }
  assert.deepEqual(ks.map(k => k[0]).sort(), ['car', 'music'], `the car and the speaker take turns (got ${JSON.stringify(ks)})`);
  assert.equal(ks[0][1], 2, 'two dots for two cards');
  assert.ok(await R(() => !!document.querySelector('home-panel').shadowRoot.querySelector('#iwrap .iclk2 .wxi')), 'the clock keeps its weather icon');
  await page.screenshot({path: join(OUT, 'stack-ipad-idle.png')});
  await R(() => { const r = document.querySelector('home-panel'); r.stackGo('sh-car'); r.idleArm(); });
  await page.waitForTimeout(500);
  assert.ok(await R(() => !document.querySelector('home-panel').shadowRoot.getElementById('pane-car').hidden), 'the car card leads to the car');
}});
await run('stack-iphone', {house: 'full', cfg: FULL_CFG, viewport: iphone, time: '2026-11-07T23:30:00-05:00', check: async page => {
  await page.evaluate(() => document.querySelector('home-panel').idleStart());
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => { const r = document.querySelector('home-panel').shadowRoot, c = r.querySelector('#istk .sc').getBoundingClientRect(), k = r.querySelector('#iclk').getBoundingClientRect(); return {below: c.top >= k.bottom - 1, inside: c.left >= 0 && c.right <= innerWidth}; });
  assert.deepEqual(box, {below: true, inside: true}, 'on a phone in portrait the card sits under the clock, on screen');
  await page.screenshot({path: join(OUT, 'stack-iphone-idle.png')});
}});
// idle_stack.enabled: false keeps the clock alone
await run('stack-off', {house: 'full', cfg: {...FULL_CFG, idle_stack: {enabled: false}}, viewport: ipad, time: '2026-11-07T23:30:00-05:00', check: async page => {
  await page.evaluate(() => document.querySelector('home-panel').idleStart());
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelectorAll('#iwrap .sc').length), 0, 'no card when the stack is off');
}});
// the names on the Lights tab's area cards, in order
const lightTiles = async page => {
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#rail [data-tab="lights"]').click());
  await page.waitForTimeout(500);
  return page.evaluate(() => [...document.querySelector('home-panel').shadowRoot.querySelectorAll('#pane-lights .lrow .tx b')].map(b => b.textContent));
};
// split_light_areas: the kitchen's two light groups get a tile each, named by what tells them apart
await run('split-lights-ipad', {house: 'full', cfg: {...FULL_CFG, split_light_areas: ['kitchen']}, viewport: ipad, check: async (page, calls) => {
  assert.deepEqual(await lightTiles(page), ['Island', 'Sink', 'Living room', 'Office'], 'one tile per kitchen group, kept together where the kitchen sorts');
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#pane-lights .lrow button.lbulb[data-a="light.kitchen_sink"]').click());
  await page.waitForTimeout(300);
  assert.ok(calls.some(c => /^light\.turn_on .*kitchen_sink_1/.test(c) && !/island/.test(c)), `the Sink tile switches only its own bulbs (calls: ${calls.join('; ')})`);
}});
await run('split-lights-iphone', {house: 'full', cfg: {...FULL_CFG, split_light_areas: ['kitchen']}, viewport: iphone});
// light_links: the kitchen's two cards are linked, so one switch reaches both; Living room is linked to Office with no switch (always together)
const LINK_CFG = {...FULL_CFG, split_light_areas: ['kitchen'], light_links: [{lights: ['light.kitchen_island', 'light.kitchen_sink'], switch: 'input_boolean.kitchen_lights_linked'}, ['office', 'living_room']]};
await run('linked-lights-ipad', {house: 'full', cfg: LINK_CFG, viewport: ipad, check: async (page, calls) => {
  assert.deepEqual(await lightTiles(page), ['Island', 'Sink', 'Office', 'Living room'], 'the second card of a pair follows the first');
  const pairs = await page.evaluate(() => [...document.querySelector('home-panel').shadowRoot.querySelectorAll('#pane-lights .llink')].map(w => [w.classList.contains('on'), w.querySelectorAll('.lrow').length, !!w.querySelector('.lnk')]));
  assert.deepEqual(pairs, [[true, 2, true], [true, 2, false]], 'two joined pairs; only the one with a switch has the chain button');
  const press = sel => page.evaluate(s => document.querySelector('home-panel').shadowRoot.querySelector(s).click(), sel);
  await press('#pane-lights .lrow button.lbulb[data-a="light.kitchen_sink"]'); await page.waitForTimeout(300);
  assert.ok(calls.some(c => /^light\.turn_off .*kitchen_island_1.*kitchen_sink_1|^light\.turn_off .*kitchen_sink_1.*kitchen_island_1/.test(c)) || calls.some(c => /^light\.turn_on .*kitchen_island_1/.test(c) && /kitchen_sink_1/.test(c)), `a linked card's switch reaches both cards (calls: ${calls.join('; ')})`);
  await press('#pane-lights .lnk'); await page.waitForTimeout(300);
  assert.ok(calls.some(c => /^input_boolean\.turn_off .*kitchen_lights_linked/.test(c)), `the chain button unlinks (calls: ${calls.join('; ')})`);
}});
await run('linked-lights-iphone', {house: 'full', cfg: LINK_CFG, viewport: iphone, check: async page => {
  const r = await page.evaluate(async () => { const root = document.querySelector('home-panel').shadowRoot; root.querySelector('[data-tab="lights"]').click(); await new Promise(f => setTimeout(f, 500));
    const blocks = root.querySelectorAll('#ltiles .llink.on').length, buttons = root.querySelectorAll('#ltiles .lnk').length;
    root.querySelector('#ltiles .lrow[data-lsheet="light.kitchen_island"] .tx').click(); await new Promise(f => setTimeout(f, 600));
    return {blocks, buttons, row: !!root.querySelector('#lsheet .lsrow button[data-l="link"]')}; });
  assert.deepEqual(r, {blocks: 2, buttons: 0, row: true}, 'phone: joined blocks, no chain button, the link switch in the sheet');
}});
// 2.4.0 dimmer rows: a sideways slide dims and doesn't open the sheet, an up-down move doesn't dim, a tap opens the sheet,
// the arrows dim from the keyboard, and Auto sits on the tablet row but not on the phone's
const dimRow = async (page, aid) => page.evaluate(a => { const r = document.querySelector('home-panel').shadowRoot.querySelector(`.lrow[data-dim="${a}"]:not([hidden])`); const b = r.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height}; }, aid);
const panelOpen = page => page.evaluate(() => document.querySelector('home-panel').open);
await run('dimmer-rows-ipad', {house: 'full', cfg: LINK_CFG, viewport: ipad, check: async (page, calls) => {
  await lightTiles(page);
  const r = await dimRow(page, 'light.kitchen_island'), y = r.y + r.h / 2;
  await page.mouse.move(r.x + r.w * .45, y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(r.x + r.w * .45 + i * 20, y + 2);
  await page.mouse.up(); await page.waitForTimeout(300);
  const br = calls.filter(c => /^light\.turn_on .*kitchen_island_1/.test(c) && /brightness_pct/.test(c));
  assert.equal(br.length, 1, `a slide sends one brightness (calls: ${calls.join('; ')})`);
  assert.ok(JSON.parse(br[0].replace(/^\S+ /, '')).brightness_pct > 59, 'sliding right brightens');
  assert.notEqual(await panelOpen(page), 'sh-light', 'a slide does not open the sheet');
  const n = calls.length;
  await page.mouse.move(r.x + r.w * .5, y); await page.mouse.down(); await page.mouse.move(r.x + r.w * .5 + 4, y + 60, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(200);
  assert.ok(!calls.slice(n).some(c => /brightness_pct/.test(c)), 'an up-down move does not dim');
  await page.evaluate(() => document.querySelector('home-panel').hide()); await page.waitForTimeout(200);
  await page.mouse.click(r.x + r.w * .3, y); await page.waitForTimeout(400);
  assert.equal(await panelOpen(page), 'sh-light', 'a tap on the row opens the sheet');
  await page.evaluate(() => document.querySelector('home-panel').hide()); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('.lrow[data-dim="office"]').focus()); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
  assert.ok(calls.some(c => /^light\.turn_on .*office_1.*"brightness_pct":68/.test(c)), `ArrowLeft dims by 10 % (calls: ${calls.join('; ')})`);
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('.lrow[data-dim="office"] button.lauto[data-l="al"]').click()); await page.waitForTimeout(200);
  assert.ok(calls.some(c => /^switch\.turn_off .*adaptive_lighting_office/.test(c)), `Auto on the row reaches Adaptive Lighting (calls: ${calls.join('; ')})`);
}});
await run('dimmer-rows-iphone', {house: 'full', cfg: LINK_CFG, viewport: iphone, check: async page => {
  await lightTiles(page);
  const shown = await page.evaluate(() => [...document.querySelector('home-panel').shadowRoot.querySelectorAll('#ltiles .lrow .lauto')].some(b => getComputedStyle(b).display !== 'none'));
  assert.equal(shown, false, 'phone rows leave Auto and Night to the sheet');
}});
// 2.7.0 Arrange: drag a row (a linked pair as one block) to a new place; the order is saved in HA's system data for every screen
await run('arrange-lights-ipad', {house: 'full', cfg: LINK_CFG, viewport: ipad, check: async (page, calls) => {
  const ws = []; page.on('console', m => { if (m.text().startsWith('WS ')) ws.push(JSON.parse(m.text().slice(3))); });
  await lightTiles(page);
  const R = f => page.evaluate(f);
  await R(() => document.querySelector('home-panel').shadowRoot.getElementById('ledit').click()); await page.waitForTimeout(300);
  const pos = name => page.evaluate(n => { const b = [...document.querySelector('home-panel').shadowRoot.querySelectorAll('#lights .lrow')].find(r => r.querySelector('.tx b').textContent === n).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, name);
  const [x0, y0] = await pos('Living room'), [x1, y1] = await pos('Island');
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, {steps: 12}); await page.mouse.up(); await page.waitForTimeout(400);
  assert.deepEqual(await lightTiles(page), ['Office', 'Living room', 'Island', 'Sink'], 'the dragged pair moves first, as one block');
  assert.deepEqual(ws.at(-1), {type: 'frontend/set_system_data', key: 'home_panel', value: {light_order: ['office', 'light.kitchen_island']}}, 'the new order is saved for the whole house');
  assert.ok(!calls.some(c => /^light\./.test(c)), `arranging doesn't switch or dim anything (calls: ${calls.join('; ')})`);
  await R(() => document.querySelector('home-panel').shadowRoot.getElementById('ledit').click()); await page.waitForTimeout(200);
  assert.equal(await R(() => document.querySelector('home-panel').shadowRoot.getElementById('pane-lights').classList.contains('ledit')), false, 'Done leaves arranging');
}});
// a saved order is used on every screen, and only admins see Arrange
await run('arranged-lights-iphone', {house: 'full', cfg: LINK_CFG, viewport: iphone, init: () => { window.SYSDATA = {home_panel: {light_order: ['office', 'light.kitchen_island']}}; }, check: async page => {
  assert.deepEqual(await page.evaluate(async () => { const r = document.querySelector('home-panel').shadowRoot; r.querySelector('[data-tab="lights"]').click(); await new Promise(f => setTimeout(f, 500)); return [...r.querySelectorAll('#ltiles .lrow .tx b')].map(b => b.textContent); }), ['Office', 'Living room', 'Island', 'Sink'], 'the phone follows the saved order');
}});
await run('arrange-hidden-for-users', {house: 'full', cfg: LINK_CFG, viewport: ipad, query: '&admin=0', check: async page => {
  await lightTiles(page);
  assert.ok((await q(page, '#ledbar'))[0].hidden, 'no Arrange button for someone who is not an admin');
}});
await run('grouped-lights-ipad', {house: 'full', cfg: FULL_CFG, viewport: ipad, check: async page => {
  assert.deepEqual(await lightTiles(page), ['Kitchen', 'Living room', 'Office'], 'without split_light_areas an area is one tile');
}});
await run('bare-ipad', {house: 'bare', viewport: ipad, check: async page => {
  for (const sel of ['#water', '#hilo', '#rail [data-tab="car"]', '#rail [data-tab="climate"]']) assert.ok((await q(page, sel)).every(x => x.hidden), `${sel} stays hidden in a house without it`);
}});
await run('bare-iphone', {house: 'bare', viewport: iphone});

await browser.close(); srv.close();
if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall smoke tests passed');
