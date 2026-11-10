// A calendar day (a `YYYY-MM-DD` key) names the same day wherever the browser is: the forecast's day names and the
// weather records print the house's days, whichever zone the browser is in, in English and in French. The house is in
// Toronto; the browsers are in Toronto (the control), Tokyo and Auckland, a half day and more away. The clock is frozen at
// Saturday 7 November 12:00 in Toronto, which is already Sunday in Auckland.
import {test, expect, phoneOnly, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

// the phone's summary card is the pane's own: More holds Weather there
async function openWeather(house: House) {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="weather"] button').click();
  await expect(house.root().locator('#pane-weather')).toBeVisible();
}

for (const tz of ['America/Toronto', 'Asia/Tokyo', 'Pacific/Auckland']) {
  test.describe(`a browser in ${tz}`, () => {
    test.use({timezoneId: tz});

    test.describe('in English', () => {
      test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T17:00:00Z', frozen: true, forecast: true}});

      test('the forecast names the house days', async ({house}) => {
        phoneOnly();
        await openWeather(house);
        await expect(house.root().locator('hp-weather-pane .wxd span')).toHaveText(['Today', 'Sun', 'Mon', 'Tue']);
      });

      test('the season records print the house days', async ({house}) => {
        tabletOnly();
        await house.tab('weather');
        const records = house.root().locator('#wrec .tile');
        await expect(records.nth(0)).toContainText('Warmest');
        await expect(records.nth(0)).toContainText('Sep 22');
        await expect(records.nth(1)).toContainText('Oct 11');
        await expect(house.root().locator('#wseasonp')).toContainText('since Sep 9,');
      });
    });

    test.describe('in French', () => {
      test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T17:00:00Z', frozen: true, forecast: true, lang: 'fr'}});

      test('the forecast names the house days', async ({house}) => {
        phoneOnly();
        await openWeather(house);
        await expect(house.root().locator('hp-weather-pane .wxd span')).toHaveText([
          "Aujourd'hui",
          'Dim.',
          'Lun.',
          'Mar.',
        ]);
      });
    });
  });
}
