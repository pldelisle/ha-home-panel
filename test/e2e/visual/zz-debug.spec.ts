// TEMPORARY diagnostic for #256 (removed before merge): prints every pixel where the Status checks screenshot differs from its baseline.
import {readFileSync} from 'node:fs';
import {test, expect} from '../fixtures';
import {AFTERNOON, FULL_CFG, VIEWPORTS} from '../houses';
import {pill, stopCharging, openFrontDoor, openPopup} from '../live';

test.use({viewport: VIEWPORTS.tablet, houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});
test('zz debug status checks', async ({house}) => {
  await stopCharging(house);
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/);
  await expect(house.root().locator('#pane-home')).toContainText('unplugged');
  await expect(house.root().locator('#pane-home')).toContainText('Front door open');
  await openPopup(house);
  await house.page.waitForTimeout(1000);
  const actual = (await house.page.screenshot({animations: 'disabled', caret: 'hide'})).toString('base64');
  const expected = readFileSync(
    'test/e2e/__screenshots__/visual/states.spec.ts/status-checks-tablet-light-en.png',
  ).toString('base64');
  const page = await house.page.context().newPage();
  const out = await page.evaluate(
    async ([a, e]) => {
      const load = (s: string) =>
        new Promise<HTMLImageElement>(r => {
          const i = new Image();
          i.onload = () => r(i);
          i.src = ['data:image', 'png;base64,'].join('/') + s;
        });
      const [ia, ie] = await Promise.all([load(a), load(e)]);
      const data = (i: HTMLImageElement) => {
        const k = document.createElement('canvas');
        k.width = i.width;
        k.height = i.height;
        const x = k.getContext('2d')!;
        x.drawImage(i, 0, 0);
        return x.getImageData(0, 0, i.width, i.height).data;
      };
      const da = data(ia),
        de = data(ie);
      const pts: number[][] = [];
      for (let p = 0; p < da.length; p += 4)
        if (da[p] !== de[p] || da[p + 1] !== de[p + 1] || da[p + 2] !== de[p + 2] || da[p + 3] !== de[p + 3])
          pts.push([
            (p / 4) % ia.width,
            Math.floor(p / 4 / ia.width),
            da[p],
            da[p + 1],
            da[p + 2],
            da[p + 3],
            de[p],
            de[p + 1],
            de[p + 2],
            de[p + 3],
          ]);
      return pts;
    },
    [actual, expected],
  );
  console.log('ZZPIXELS ' + JSON.stringify(out));
});
