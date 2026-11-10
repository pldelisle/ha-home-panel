// The weather forecast follows the panel's config: a house that names its weather entity gets that entity's forecasts, not the one the
// panel found before the config arrived. The harness hands the panel `hass` first and the config after (a draw with the discovered
// entity, then one with the configured entity), and the subscription of the first draw must not outlive it.
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';

test.describe('a house that names its weather entity', () => {
  test.use({houseOpts: {cfg: {...FULL_CFG, entities: {...FULL_CFG.entities, weather: 'weather.springfield'}}}});

  test('the forecasts are the named entity daily and hourly, not the one discovery picks', async ({house}) => {
    await expect
      .poll(() => house.ws.filter(m => m.type === 'weather/subscribe_forecast').length)
      .toBeGreaterThanOrEqual(2);
    const subs = house.ws.filter(m => m.type === 'weather/subscribe_forecast') as unknown as Array<{
      entity_id: string;
      forecast_type: string;
    }>;
    expect(
      subs.slice(-2).map(m => [m.entity_id, m.forecast_type]),
      'the last two subscriptions, which are the ones left running',
    ).toEqual([
      ['weather.springfield', 'daily'],
      ['weather.springfield', 'hourly'],
    ]);
    // and the first draw's two were let go of: the panel holds one pair
    await expect.poll(() => house.subscribed('weather/subscribe_forecast')).toBe(2);
  });
});
