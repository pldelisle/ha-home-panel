// The Weather tab's tiles open a history sheet with a chart of that measure (since 2.0.0 it said the sensor was missing).
import {test, expect, tabletOnly} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

for (const [key, title] of [
  ['wind', 'Wind'],
  ['pres', 'Pressure'],
  ['hum', 'Humidity'],
]) {
  test(`the ${title} tile opens a history sheet with its chart`, async ({house}) => {
    tabletOnly();
    await house.tab('weather');
    await house.root().locator(`#pane-weather button[data-wx="${key}"]`).click();
    const sheet = house.root().locator('#sh-wx');
    await expect(sheet.locator('#c-wx .apexcharts-canvas')).toBeVisible();
    await expect(sheet.locator('#wxh')).toHaveText(title);
    await expect(sheet.locator('#c-wx')).not.toContainText('not in Home Assistant right now');
  });
}
