// The Media tab (spec 16): <hp-media-pane> on the tablet, its television box and speaker pods, what a tap sends and shows at once,
// and what the pane costs; on the phone it draws its header and the guest's tiles stay (#218 moves them).
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

  // the guest's renderMedia draws only on the phone, whose tiles open these cards; a rule hides them in the pane, so only their
  // content tells whether the guest drew the tablet's pane a second time
  test("leaves the guest's Media cards empty: the pane is the tablet's one drawer", async ({house}) => {
    await house.tab('media');
    await expect(pod(house).locator('.sv b')).toHaveText('35%');
    await expect(house.root().locator('#pane-media > #mtv')).toBeEmpty();
    await expect(house.root().locator('#pane-media > #media')).toBeEmpty();
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

    // the legacy tvCmd's fifteen seconds, where the other controls hold twenty: Home Assistant never answers here
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

test('on a phone the pane draws its header and the guest still draws the tiles', async ({house}) => {
  phoneOnly();
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="media"] button').click();
  await expect(pane(house).getByRole('heading', {name: 'Media'})).toBeVisible();
  await expect(house.root().locator('#mtiles .stile')).toHaveCount(2);
  await expect(pane(house).locator('hp-tv-box, hp-speaker-pod')).toHaveCount(0);
});
