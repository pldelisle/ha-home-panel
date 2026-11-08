// The Lights tab shows one tile per room, the way Apple's Home app does: the bulb switches the room and the rest of the
// tile opens it. An area is one tile unless split_light_areas gives each of its light groups a tile.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';
import {tileNames, callsMessage} from './lights';

const SPLIT_CFG = {...FULL_CFG, split_light_areas: ['kitchen']};
const isPhone = () => test.info().project.name === 'phone';

test.describe('split kitchen', () => {
  test.use({houseOpts: {cfg: SPLIT_CFG}});

  test('22 one tile per kitchen group, and the Sink bulb switches only its own lights', async ({house}) => {
    test.skip(isPhone(), 'tablet layout');
    expect(await tileNames(house), 'one tile per kitchen group, kept together where the kitchen sorts').toEqual([
      'Island',
      'Sink',
      'Living room',
      'Office',
    ]);
    await house.root().locator('#pane-lights .lcell button.lbulb[data-a="light.kitchen_sink"]').click();
    await expect
      .poll(
        () => house.calls.some(c => /^light\.turn_on .*kitchen_sink_1/.test(c) && !/island/.test(c)),
        callsMessage(house, 'the Sink tile switches only its own bulbs'),
      )
      .toBe(true);
  });

  test('23 the Lights tab opens on a phone with no page error', async ({house}) => {
    test.skip(!isPhone(), 'phone layout');
    await tileNames(house); // the fixture fails the test on a page error
  });
});

test.describe('whole areas', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('24 without split_light_areas an area is one tile', async ({house}) => {
    test.skip(isPhone(), 'tablet layout');
    expect(await tileNames(house)).toEqual(['Kitchen', 'Living room', 'Office']);
  });

  test('25 two tiles to a row on a phone', async ({house}) => {
    test.skip(!isPhone(), 'phone layout');
    await house.tab('lights');
    const columns = await house
      .root()
      .locator('#ltiles')
      .evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);
  });
});
