// The TV card's buttons reach Home Assistant (1.19.9: they crashed on a removed method before sending anything).
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

test('7 the TV mute and power buttons send their services', async ({house}) => {
  test.skip(test.info().project.name === 'phone', 'tablet layout');
  await house.tab('media');
  await house.root().locator('#pane-media button[data-tv="mute"]').click();
  await house.root().locator('#pane-media button[data-tv="power"]').click();
  await expect.poll(() => house.calls.some(c => /^media_player\.volume_mute /.test(c)), `mute sends media_player.volume_mute (calls: ${house.calls.join('; ')})`).toBe(true);
  await expect.poll(() => house.calls.some(c => /^media_player\.turn_off /.test(c)), `power sends media_player.turn_off (calls: ${house.calls.join('; ')})`).toBe(true);
});
