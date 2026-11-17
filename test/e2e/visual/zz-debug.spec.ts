// TEMPORARY diagnostic for #256 (removed before merge): prints where the Status checks screenshot differs from its baseline.
import {readFileSync} from 'node:fs';
import {test, expect, fontsLoaded} from '../fixtures';
import {AFTERNOON, FULL_CFG, VIEWPORTS} from '../houses';
import {pill, stopCharging, openFrontDoor, openPopup} from '../live';

test.use({viewport: VIEWPORTS.tablet, houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});
test('zz debug status checks', async ({house}) => {
  await fontsLoaded(house);
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
      const c = (i: HTMLImageElement) => {
        const k = document.createElement('canvas');
        k.width = i.width;
        k.height = i.height;
        const x = k.getContext('2d')!;
        x.drawImage(i, 0, 0);
        return x;
      };
      const ca = c(ia),
        ce = c(ie);
      const da = ca.getImageData(0, 0, ia.width, ia.height).data,
        de = ce.getImageData(0, 0, ie.width, ie.height).data;
      const pts: number[][] = [];
      for (let p = 0; p < da.length; p += 4)
        if (da[p] !== de[p] || da[p + 1] !== de[p + 1] || da[p + 2] !== de[p + 2])
          pts.push([
            (p / 4) % ia.width,
            Math.floor(p / 4 / ia.width),
            Math.abs(da[p] - de[p]) + Math.abs(da[p + 1] - de[p + 1]) + Math.abs(da[p + 2] - de[p + 2]),
          ]);
      if (!pts.length) return {n: 0};
      const big = pts.filter(q => q[2] > 6);
      const bx = big.map(q => q[0]),
        by = big.map(q => q[1]);
      const box2 = big.length
        ? [
            bx.reduce((m, v) => Math.min(m, v)),
            by.reduce((m, v) => Math.min(m, v)),
            bx.reduce((m, v) => Math.max(m, v)),
            by.reduce((m, v) => Math.max(m, v)),
          ]
        : null;
      const xs = pts.map(q => q[0]),
        ys = pts.map(q => q[1]);
      const box = [
        xs.reduce((m, v) => Math.min(m, v)),
        ys.reduce((m, v) => Math.min(m, v)),
        xs.reduce((m, v) => Math.max(m, v)),
        ys.reduce((m, v) => Math.max(m, v)),
      ];
      const crop = (x: CanvasRenderingContext2D) => {
        const k = document.createElement('canvas');
        const w = Math.min(240, box[2] - box[0] + 21),
          h = Math.min(120, box[3] - box[1] + 21);
        k.width = w;
        k.height = h;
        k.getContext('2d')!.drawImage(x.canvas, box[0] - 10, box[1] - 10, w, h, 0, 0, w, h);
        return k.toDataURL();
      };
      return {n: pts.length, box, nbig: big.length, box2, pts: pts.slice(0, 120), a: crop(ca), e: crop(ce)};
    },
    [actual, expected],
  );
  console.log('ZZDEBUG ' + JSON.stringify(out));
});
