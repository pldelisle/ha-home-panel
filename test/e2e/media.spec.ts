// The Media tab (spec 16): <hp-media-pane> on the tablet, its television box and speaker pods, what a tap sends and shows at once,
// and what the pane costs; on the phone its tiles, what their controls send, and the sheet a tile opens; the Home tab's scenes row.
// Test titles that start with a number are the checks of docs/specs/01-playwright-test.md.
import {test, expect, expectCall, phoneOnly, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

const TV = 'media_player.living_room_tv';
const SPEAKER = 'media_player.living_room_speaker';
const WAKE = 'button.wake_on_lan_living_room_tv';

const pane = (house: House) => house.root().locator('#pane-media hp-media-pane');
const pod = (house: House) => pane(house).locator('hp-speaker-pod');
const power = (house: House) => pane(house).getByRole('switch', {name: 'Samsung TV power'});
const calls = (house: House, prefix: string) => house.calls.filter(c => c.startsWith(prefix));

test('7 the TV mute and power buttons send their services', async ({house}) => {
  tabletOnly();
  await house.tab('media');
  await house.root().locator('#pane-media').getByRole('button', {name: 'Mute', exact: true}).click();
  await house.root().locator('#pane-media').getByRole('switch', {name: 'Samsung TV power'}).click();
  await expectCall(house, /^media_player\.volume_mute /);
  await expectCall(house, /^media_player\.turn_off /);
});

test.describe('the tablet', () => {
  test.beforeEach(() => tabletOnly());

  test("five quick taps on a speaker's + show each level at once and send one volume_set, at the last level", async ({
    house,
  }) => {
    await house.tab('media');
    const up = pod(house).getByRole('button', {name: 'Volume up'});
    for (let i = 0; i < 5; i++) await up.click();
    await expect(pod(house).locator('.sv b')).toHaveText('60%');
    await expectCall(
      house,
      /^media_player\.volume_set \{"entity_id":"media_player\.living_room_speaker","volume_level":0\.6\}$/,
    );
    expect(calls(house, 'media_player.volume_set'), 'one call for the burst').toHaveLength(1);
  });

  // the pod cancels its waiting send in disconnectedCallback and releases the level it held, and its connectedCallback arms nothing:
  // a fresh tap starts a fresh wait
  test('a volume tap whose pod leaves the document within the wait sends nothing, even when the panel comes back', async ({
    house,
  }) => {
    await house.tab('media');
    await pod(house).getByRole('button', {name: 'Volume up'}).click();
    await house.page.evaluate(() => {
      const p = (window as unknown as {panel: HTMLElement}).panel;
      const next = p.nextSibling;
      p.remove();
      document.body.insertBefore(p, next);
    });
    await house.page.waitForTimeout(900);
    expect(calls(house, 'media_player.volume_set')).toEqual([]);
    await expect(pod(house).locator('.sv b'), 'the level Home Assistant reports, not the one never sent').toHaveText(
      '35%',
    );
  });

  test('play on a paused speaker shows the pause button at once and sends media_play', async ({house}) => {
    await house.setState(SPEAKER, {state: 'paused'});
    await house.tab('media');
    await pod(house).getByRole('button', {name: 'Play', exact: true}).click();
    // the harness never answers with a new state, so what shows is the value the tap holds
    await expect(pod(house).getByRole('button', {name: 'Pause', exact: true})).toBeEnabled();
    await expectCall(house, /^media_player\.media_play \{"entity_id":"media_player\.living_room_speaker"\}$/);
    await expect(house.root().locator('#toast')).toHaveText('speaker playing');
  });

  test.describe('a television that will not turn on', () => {
    test.beforeEach(async ({house}) => {
      await house.setState(TV, {state: 'off'});
    });

    test('is woken by its wake-on-LAN button when the house has one', async ({house}) => {
      await house.setState(WAKE, {state: 'unknown', attributes: {friendly_name: 'Wake on LAN TV'}});
      await house.tab('media');
      await house.failNext('media_player.turn_on');
      await power(house).click();
      await expectCall(house, /^button\.press \{"entity_id":"button\.wake_on_lan_living_room_tv"\}$/);
      await expect(house.root().locator('#toast')).toHaveText('Turning the TV on');
      await expect(power(house)).toHaveAttribute('aria-checked', 'true');
    });

    test('says why in a toast that stays, and its switch returns to off, when the house has none', async ({house}) => {
      await house.tab('media');
      await house.failNext('media_player.turn_on');
      await power(house).click();
      const toast = house.root().locator('#toast');
      await expect(toast).toContainText("Didn't work: the service call failed on purpose");
      await expect(toast).toHaveAttribute('role', 'alert');
      await expect(power(house)).toHaveAttribute('aria-checked', 'false');
      expect(calls(house, 'button.')).toEqual([]);
    });
  });

  test.describe('a tap on the television', () => {
    test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

    // the television's fifteen seconds (the other controls hold twenty), as the legacy panel's; Home Assistant never answers
    test('holds what it asked for fifteen seconds, then shows what Home Assistant says', async ({house}) => {
      await house.tab('media');
      // the page's clock stands still, so only fastForward moves it and an expectation's retries cannot outwait a hold
      await house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);
      await power(house).click();
      await expect(power(house)).toHaveAttribute('aria-checked', 'false');
      await house.clock.fastForward(14_000);
      await expect(power(house)).toHaveAttribute('aria-checked', 'false');
      await house.clock.fastForward(2_000);
      await expect(power(house)).toHaveAttribute('aria-checked', 'true');
    });
  });

  test.describe('what it costs', () => {
    // A tripwire: the speaker's state object is changed in place, which no store notices (it compares references), so the pane shows
    // it only if it draws again. A thermostat change must not make it draw: the pane listens to the Media ids alone.
    test('a thermostat change draws nothing in the pane, its box or its pods', async ({house}) => {
      await house.tab('media');
      await expect(pod(house).locator('.sv b')).toHaveText('35%');
      await house.page.evaluate(id => {
        (window as unknown as {hass: {states: Record<string, {state: string}>}}).hass.states[id].state = 'idle';
      }, SPEAKER);
      await house.mutations.reset();
      await house.setState('climate.living_room', {attributes: {temperature: 23}});
      await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await house.mutations.count('hp-media-pane, hp-tv-box, hp-speaker-pod'), 'mutations').toBe(0);
      await expect(pane(house).getByText('1 speaker playing', {exact: true})).toBeVisible();
    });
  });
});

test.describe('the phone', () => {
  test.beforeEach(async ({house}) => {
    phoneOnly();
    await house.root().locator('#moretab').click();
    await house.root().locator('#morelist hp-stat-tile[key="media"] button').click();
  });

  const tile = (house: House, name: string) => pane(house).locator('hp-media-tile').filter({hasText: name});
  // the sheet's panel, by the name a screen reader gives it, and what the sheet holds: its card is slotted, so it is the
  // element's child and not the panel's
  const panel = (house: House, name: string) => house.root().getByRole('dialog', {name});
  const sheet = (house: House) => pane(house).locator('hp-sheet');

  test("a tap on the television's tile opens its box in a sheet, and Escape closes it and gives the tile its focus back", async ({
    house,
  }) => {
    await tile(house, 'Samsung TV').getByText('Samsung TV', {exact: true}).click();
    await expect(panel(house, 'Samsung TV')).toBeVisible();
    await expect(sheet(house).getByRole('switch', {name: 'Samsung TV power'})).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(panel(house, 'Samsung TV')).toBeHidden();
    await expect(sheet(house).locator('hp-tv-box'), 'a closed sheet holds no box').toHaveCount(0);
    await expect(tile(house, 'Samsung TV').getByRole('button', {name: /Samsung TV/})).toBeFocused();
  });

  test("a speaker's tile opens the speakers' card, Enter as well as a tap", async ({house}) => {
    await tile(house, 'Living room')
      .getByRole('button', {name: /Living room/})
      .press('Enter');
    await expect(panel(house, 'Speakers')).toBeVisible();
    await expect(sheet(house).locator('hp-speaker-pod')).toHaveCount(1);
    await expect(sheet(house).getByText('1 speaker playing', {exact: true})).toBeVisible();
  });

  test("the switch on the television's tile turns it off at once, and opens nothing", async ({house}) => {
    const power = tile(house, 'Samsung TV').getByRole('switch', {name: 'Samsung TV power'});
    await power.click();
    await expect(power).toHaveAttribute('aria-checked', 'false');
    await expectCall(house, /^media_player\.turn_off \{"entity_id":"media_player\.living_room_tv"\}$/);
    await expect(house.root().getByRole('dialog')).toHaveCount(0);
  });

  test("the play button on a speaker's tile pauses it at once, and opens nothing", async ({house}) => {
    await tile(house, 'Living room').getByRole('button', {name: 'Pause', exact: true}).click();
    await expect(tile(house, 'Living room').getByRole('button', {name: 'Play', exact: true})).toBeEnabled();
    await expectCall(house, /^media_player\.media_pause \{"entity_id":"media_player\.living_room_speaker"\}$/);
    await expect(house.root().getByRole('dialog')).toHaveCount(0);
  });

  test('draws a tile per player, and leaves the box and the pods to the sheets', async ({house}) => {
    await expect(pane(house).locator('hp-media-tile')).toHaveCount(2);
    await expect(pane(house).locator('hp-tv-box, hp-speaker-pod')).toHaveCount(0);
  });
});

// The Home tab's scenes row, <hp-scene-tiles>, which the guest places by its tag (ADR 0024); Home Assistant never answers here, so
// what a tile shows after a tap is what the tap holds
test.describe('the Home scenes row', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

  const row = (house: House) => house.root().locator('#hscenes hp-scene-tiles');
  const tile = (house: House, name: string) => row(house).getByRole('button').filter({hasText: name});
  const line = (house: House, name: string) => tile(house, name).locator('small');

  test('a scene says Done for four seconds after a tap, and scene.turn_on is sent', async ({house}) => {
    // the page's clock stands still, so only fastForward moves it and an expectation's retries cannot outwait the four seconds
    await house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);
    await tile(house, 'Movie night').click();
    await expect(line(house, 'Movie night')).toHaveText('Done');
    await expectCall(house, /^scene\.turn_on \{"entity_id":"scene\.movie_night"\}$/);
    await expect(house.root().locator('#toast')).toHaveText('Movie night on');
    await house.clock.fastForward(3_900);
    await expect(line(house, 'Movie night')).toHaveText('Done');
    await house.clock.fastForward(200);
    await expect(line(house, 'Movie night')).toHaveText('Tap to run');
  });

  test('a mode turns on at once and sends input_boolean.turn_on', async ({house}) => {
    await tile(house, 'Kids bedtime').click();
    await expect(tile(house, 'Kids bedtime')).toHaveAttribute('aria-pressed', 'true');
    await expect(line(house, 'Kids bedtime')).toHaveText('On');
    await expectCall(house, /^input_boolean\.turn_on \{"entity_id":"input_boolean\.kids_bedtime"\}$/);
    await expect(house.root().locator('#toast')).toHaveText('Kids bedtime on');
  });

  test('a scene that fails says why and lets go of its own Done alone: the mode turned on before stays on', async ({
    house,
  }) => {
    await tile(house, 'Kids bedtime').click();
    await expect(tile(house, 'Kids bedtime')).toHaveAttribute('aria-pressed', 'true');
    await house.failNext('scene.turn_on');
    await tile(house, 'Movie night').click();
    const toast = house.root().locator('#toast');
    await expect(toast).toContainText("Didn't work: the service call failed on purpose");
    await expect(toast).toHaveAttribute('role', 'alert');
    await expect(line(house, 'Movie night')).toHaveText('Tap to run');
    await expect(tile(house, 'Kids bedtime')).toHaveAttribute('aria-pressed', 'true');
  });

  // nothing in the house changes, so only the row's own minute redraw can move the line on
  test('a "Last … ago" line keeps time: a minute later it says one minute more', async ({house}) => {
    await house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);
    const ran = await house.page.evaluate(() => new Date(Date.now() - 5 * 60_000).toISOString());
    await house.setState('scene.movie_night', {state: ran});
    await expect(line(house, 'Movie night')).toHaveText('Last 5 min ago');
    await house.clock.fastForward(60_000);
    await expect(line(house, 'Movie night')).toHaveText('Last 6 min ago');
  });

  // The tripwire of the pane's test: the mode's state object is changed in place, which no store notices, so the row shows it only if
  // it draws again. A thermostat change must not make it draw: the row listens to the Media ids alone.
  test('a thermostat change draws nothing in the row', async ({house}) => {
    await expect(line(house, 'Kids bedtime')).toHaveText('Off');
    await house.page.evaluate(id => {
      (window as unknown as {hass: {states: Record<string, {state: string}>}}).hass.states[id].state = 'on';
    }, 'input_boolean.kids_bedtime');
    await house.mutations.reset();
    await house.setState('climate.living_room', {attributes: {temperature: 23}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-scene-tiles'), 'mutations').toBe(0);
    await expect(line(house, 'Kids bedtime')).toHaveText('Off');
  });
});

// The row's container is the guest's: it shows and hides on the element's hp-empty, as the legacy panel showed and hid it
test.describe('the Home scenes row, in a house with no scene and no mode', () => {
  test.use({houseOpts: {house: 'bare'}});

  // what Home Assistant does to the scene's registry entry: a new entity registry in a new hass object, which every element hears
  const register = (house: House, entry: object) =>
    house.page.evaluate(entry => {
      const w = window as unknown as {panel: {hass: unknown}; hass: {entities: object}};
      w.panel.hass = {
        ...w.hass,
        entities: {...w.hass.entities, 'scene.reading': {entity_id: 'scene.reading', ...entry}},
      };
    }, entry);

  test('is hidden, shows when a scene is created, and hides again when the scene is hidden', async ({house}) => {
    const row = house.root().locator('#hscenes');
    await expect(row).toBeHidden();
    await house.setState('scene.reading', {state: 'unknown', attributes: {friendly_name: 'Reading'}});
    await register(house, {});
    await expect(row.getByRole('button', {name: /Reading/})).toBeVisible();
    await register(house, {hidden: true});
    await expect(row).toBeHidden();
  });
});

test.describe('the phone, in a house with no player', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('says so where the tiles would be', async ({house}) => {
    phoneOnly();
    await house.root().locator('#moretab').click();
    await house.root().locator('#morelist hp-stat-tile[key="media"] button').click();
    await expect(pane(house).getByText('No TV or speakers found.', {exact: true})).toBeVisible();
  });
});
