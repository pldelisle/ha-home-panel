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
  // the Home card has no Status block of its own any more: the pill says it (2.8.1)
  const hw = await R(() => { const P = document.querySelector('home-panel'); P.renderHome(); const h = P.shadowRoot.getElementById('hwx'); return h ? h.textContent : null; });
  assert.ok(hw != null && /Who's home/.test(hw) && !/Status|All clear/.test(hw), `the Home card ends at Who's home (got ${JSON.stringify(hw && hw.slice(-120))})`);
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
  return page.evaluate(() => [...document.querySelector('home-panel').shadowRoot.querySelectorAll('#pane-lights .lcell .tx b')].map(b => b.textContent));
};
// split_light_areas: the kitchen's two light groups get a tile each, named by what tells them apart
await run('split-lights-ipad', {house: 'full', cfg: {...FULL_CFG, split_light_areas: ['kitchen']}, viewport: ipad, check: async (page, calls) => {
  assert.deepEqual(await lightTiles(page), ['Island', 'Sink', 'Living room', 'Office'], 'one tile per kitchen group, kept together where the kitchen sorts');
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#pane-lights .lcell button.lbulb[data-a="light.kitchen_sink"]').click());
  await page.waitForTimeout(300);
  assert.ok(calls.some(c => /^light\.turn_on .*kitchen_sink_1/.test(c) && !/island/.test(c)), `the Sink tile switches only its own bulbs (calls: ${calls.join('; ')})`);
}});
await run('split-lights-iphone', {house: 'full', cfg: {...FULL_CFG, split_light_areas: ['kitchen']}, viewport: iphone});
// light_links: the kitchen's two cards are linked (its switch is on), Living room is linked to Office with no switch
const LINK_CFG = {...FULL_CFG, split_light_areas: ['kitchen'], light_links: [{lights: ['light.kitchen_island', 'light.kitchen_sink'], switch: 'input_boolean.kitchen_lights_linked'}, ['office', 'living_room']]};
const panelOpen = page => page.evaluate(() => document.querySelector('home-panel').open);
const sheetPress = (page, sel) => page.evaluate(s => document.querySelector('home-panel').shadowRoot.querySelector(s).click(), sel);
await run('linked-lights-ipad', {house: 'full', cfg: LINK_CFG, viewport: ipad, check: async (page, calls) => {
  const ws = []; page.on('console', m => { if (m.text().startsWith('WS ')) ws.push(JSON.parse(m.text().slice(3))); });
  assert.deepEqual(await lightTiles(page), ['Island', 'Sink', 'Office', 'Living room'], 'the second card of a pair follows the first');
  assert.equal(await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelectorAll('#pane-lights .llink.on').length), 2, 'two linked pairs, each one block');
  await sheetPress(page, '#pane-lights .lcell button.lbulb[data-a="light.kitchen_sink"]'); await page.waitForTimeout(300);
  assert.ok(calls.some(c => /^light\.turn_(on|off) .*kitchen_(island|sink)_1.*kitchen_(island|sink)_1/.test(c)), `a linked tile's bulb reaches both rooms (calls: ${calls.join('; ')})`);
  // "Linked with" is a row that opens a list of the other rooms; None unlinks, and the pairs are saved for the whole house
  await page.evaluate(() => document.querySelector('home-panel').openLight('light.kitchen_island')); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#lsheet .lnav .lval').textContent), 'Sink', 'the row names the linked room');
  await sheetPress(page, '#lsheet .lnav'); await page.waitForTimeout(200);
  const opts = await page.evaluate(() => [...document.querySelector('home-panel').shadowRoot.querySelectorAll('#lsheet .lopt')].map(o => [o.querySelector('b').textContent, o.getAttribute('aria-checked')]));
  assert.deepEqual(opts, [['None', 'false'], ['Sink', 'true'], ['Office', 'false'], ['Living room', 'false']], 'None plus every other room, the partner checked');
  await sheetPress(page, '#lsheet .lopt[data-al=""]'); await page.waitForTimeout(300);
  assert.deepEqual(ws.at(-1), {type: 'frontend/set_system_data', key: 'home_panel', value: {light_links: [['office', 'living_room']]}}, 'unlinking saves the remaining pairs');
  assert.equal(await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelectorAll('#pane-lights .llink.on').length), 1, 'the kitchen tiles stand apart again');
  // pick Living room: it leaves Office and joins the Island
  await sheetPress(page, '#lsheet .lopt[data-al="living_room"]'); await page.waitForTimeout(300);
  assert.deepEqual(ws.at(-1).value.light_links, [['light.kitchen_island', 'living_room']], 'a room already linked moves to its new partner');
  assert.ok(calls.some(c => /^light\.turn_on .*living_room_1/.test(c)), `the new partner starts out matching (calls: ${calls.join('; ')})`);
  await sheetPress(page, '#lsheet .lback'); await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => !!document.querySelector('home-panel').shadowRoot.querySelector('#lsheet .lpill')), 'Back returns to the room');
}});
await run('linked-lights-iphone', {house: 'full', cfg: LINK_CFG, viewport: iphone, check: async page => {
  const r = await page.evaluate(async () => { const root = document.querySelector('home-panel').shadowRoot; root.querySelector('[data-tab="lights"]').click(); await new Promise(f => setTimeout(f, 500));
    const blocks = root.querySelectorAll('#ltiles .llink.on').length;
    root.querySelector('#ltiles .lcell[data-lsheet="light.kitchen_island"] .tx').click(); await new Promise(f => setTimeout(f, 600));
    return {blocks, row: !!root.querySelector('#lsheet .lnav'), open: document.querySelector('home-panel').open}; });
  assert.deepEqual(r, {blocks: 2, row: true, open: 'sh-light'}, 'phone: joined pairs, a tap opens the sheet with its Linked with row');
}});
// someone who isn't an admin can't change links (system data is admin-only)
await run('link-row-users', {house: 'full', cfg: LINK_CFG, viewport: ipad, query: '&admin=0', check: async page => {
  await lightTiles(page); await page.evaluate(() => document.querySelector('home-panel').openLight('office')); await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#lsheet .lnav').disabled), 'the Linked with row is read-only');
}});
// 2.10.0 tiles and the light sheet: the bulb switches, the tile opens the sheet; two tall sliders (drag, tap, arrows);
// moving one takes the room off Auto; Auto and Night are switches in a list
const pillBox = (page, lp) => page.evaluate(l => { const b = document.querySelector('home-panel').shadowRoot.querySelector(`#lsheet .lpill[data-lp="${l}"]`).getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height}; }, lp);
await run('light-sheet-ipad', {house: 'full', cfg: FULL_CFG, viewport: ipad, check: async (page, calls) => {
  await lightTiles(page);
  const t = await page.evaluate(() => { const b = document.querySelector('home-panel').shadowRoot.querySelector('#pane-lights .lcell[data-lsheet="office"]').getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height}; });
  await page.mouse.click(t.x + t.w * .7, t.y + t.h / 2); await page.waitForTimeout(400);
  assert.equal(await panelOpen(page), 'sh-light', 'a tap on the tile opens the sheet');
  assert.ok(!calls.some(c => /^light\./.test(c)), 'opening the sheet switches nothing');
  const b = await pillBox(page, 'br');
  await page.mouse.move(b.x + b.w / 2, b.y + b.h * .6); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.w / 2, b.y + b.h * (.6 - i * .07));
  await page.mouse.up(); await page.waitForTimeout(300);
  const br = calls.filter(c => /^light\.turn_on .*office_1/.test(c) && /brightness_pct/.test(c));
  assert.equal(br.length, 1, `a drag sends one brightness (calls: ${calls.join('; ')})`);
  assert.ok(JSON.parse(br[0].replace(/^\S+ /, '')).brightness_pct >= 90, 'dragging up brightens');
  assert.ok(calls.some(c => /^adaptive_lighting\.set_manual_control .*"manual_control":true/.test(c)), `a change by hand takes the room off Auto (calls: ${calls.join('; ')})`);
  const k = await pillBox(page, 'ct');
  await page.mouse.click(k.x + k.w / 2, k.y + k.h * .05); await page.waitForTimeout(300);
  const ct = calls.filter(c => /color_temp_kelvin/.test(c)).at(-1);
  assert.ok(ct && JSON.parse(ct.replace(/^\S+ /, '')).color_temp_kelvin > 6000, `a tap near the top of the colour slider picks a cool white (calls: ${calls.join('; ')})`);
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#lsheet .lpill[data-lp="br"]').focus()); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
  assert.ok(calls.some(c => /^light\.turn_on .*office_1.*"brightness_pct":86/.test(c)), `ArrowDown dims by 10 % from where the slider was left (calls: ${calls.join('; ')})`);
  await sheetPress(page, '#lsheet button.sw[data-l="al"]'); await page.waitForTimeout(200);
  assert.ok(calls.some(c => /^switch\.turn_off .*adaptive_lighting_office"/.test(c)), `the Auto switch reaches Adaptive Lighting (calls: ${calls.join('; ')})`);
  await sheetPress(page, '#lsheet button.sw[data-l="night"]'); await page.waitForTimeout(200);
  assert.ok(calls.some(c => /^switch\.turn_on .*office_sleep_mode/.test(c)), `the Night switch turns sleep mode on (calls: ${calls.join('; ')})`);
  await sheetPress(page, '#sh-light .ldone'); await page.waitForTimeout(200);
  assert.notEqual(await panelOpen(page), 'sh-light', 'Done closes the sheet');
  await page.evaluate(() => document.querySelector('home-panel').shadowRoot.querySelector('#pane-lights .lcell[data-lsheet="office"]').focus()); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  assert.equal(await panelOpen(page), 'sh-light', 'Enter on a tile opens the sheet');
}});
await run('light-tiles-iphone', {house: 'full', cfg: FULL_CFG, viewport: iphone, check: async page => {
  await lightTiles(page);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('home-panel').shadowRoot.getElementById('ltiles')).gridTemplateColumns.split(' ').length);
  assert.equal(cols, 2, 'two tiles to a row on the phone');
}});
// 2.7.0 Arrange: drag a row (a linked pair as one block) to a new place; the order is saved in HA's system data for every screen
await run('arrange-lights-ipad', {house: 'full', cfg: LINK_CFG, viewport: ipad, check: async (page, calls) => {
  const ws = []; page.on('console', m => { if (m.text().startsWith('WS ')) ws.push(JSON.parse(m.text().slice(3))); });
  await lightTiles(page);
  const R = f => page.evaluate(f);
  await R(() => document.querySelector('home-panel').shadowRoot.getElementById('ledit').click()); await page.waitForTimeout(300);
  const pos = name => page.evaluate(n => { const b = [...document.querySelector('home-panel').shadowRoot.querySelectorAll('#lights .lcell')].find(r => r.querySelector('.tx b').textContent === n).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, name);
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
  assert.deepEqual(await page.evaluate(async () => { const r = document.querySelector('home-panel').shadowRoot; r.querySelector('[data-tab="lights"]').click(); await new Promise(f => setTimeout(f, 500)); return [...r.querySelectorAll('#ltiles .lcell .tx b')].map(b => b.textContent); }), ['Office', 'Living room', 'Island', 'Sink'], 'the phone follows the saved order');
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
