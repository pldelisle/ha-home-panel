// TEMPORARY diagnostic for #256 (removed before merge): prints where the Status checks screenshot differs from its baseline, before and after the weather chip is repainted.
import {readFileSync} from 'node:fs';
import {test, expect, fontsLoaded} from '../fixtures';
import {AFTERNOON, FULL_CFG, VIEWPORTS} from '../houses';
import {pill, stopCharging, openFrontDoor, openPopup} from '../live';

test.use({viewport: VIEWPORTS.tablet, houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});
test('zz debug status checks', async ({house}) => {
  await house.page.evaluate(() => {
    const w = window as unknown as {__seq: [number, string][]};
    w.__seq = [];
    const t0 = performance.now();
    const f = () => {
      const root = document.querySelector('home-panel')?.shadowRoot;
      const n = root?.querySelector('.wxchip .num'),
        c = root?.querySelector('.wxchip');
      if (n && c) {
        const b = n.getBoundingClientRect(),
          cb = c.getBoundingClientRect();
        const s = `${b.y.toFixed(3)} chip ${cb.x.toFixed(3)},${cb.y.toFixed(3)},${cb.width.toFixed(2)}`;
        if (!w.__seq.length || w.__seq[w.__seq.length - 1][1] !== s)
          w.__seq.push([Math.round(performance.now() - t0), s]);
      }
      requestAnimationFrame(f);
    };
    f();
  });
  await fontsLoaded(house);
  await stopCharging(house);
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/);
  await expect(house.root().locator('#pane-home')).toContainText('unplugged');
  await expect(house.root().locator('#pane-home')).toContainText('Front door open');
  await openPopup(house);
  await house.page.waitForTimeout(1000);
  const expected = readFileSync(
    'test/e2e/__screenshots__/visual/states.spec.ts/status-checks-tablet-light-en.png',
  ).toString('base64');
  const cmp = async (actual: string) => {
    const page = await house.page.context().newPage();
    const r = await page.evaluate(
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
        const big: number[][] = [];
        let n = 0;
        for (let p = 0; p < da.length; p += 4) {
          const d = Math.abs(da[p] - de[p]) + Math.abs(da[p + 1] - de[p + 1]) + Math.abs(da[p + 2] - de[p + 2]);
          if (d) n++;
          if (d > 6) big.push([(p / 4) % ia.width, Math.floor(p / 4 / ia.width)]);
        }
        return {n, nbig: big.length, first: big.slice(0, 6)};
      },
      [actual, expected],
    );
    await page.close();
    return r;
  };
  const shot = async () => (await house.page.screenshot({animations: 'disabled', caret: 'hide'})).toString('base64');
  const before = await cmp(await shot());
  await house.page.evaluate(() => {
    const c = document.querySelector('home-panel')?.shadowRoot?.querySelector('.wxchip') as HTMLElement;
    c.style.outline = '1px solid transparent';
  });
  await house.page.waitForTimeout(300);
  await house.page.evaluate(() => {
    const c = document.querySelector('home-panel')?.shadowRoot?.querySelector('.wxchip') as HTMLElement;
    c.style.outline = '';
  });
  await house.page.waitForTimeout(300);
  const after = await cmp(await shot());
  const seq = await house.page.evaluate(() => (window as unknown as {__seq: unknown}).__seq);
  console.log('ZZDEBUG ' + JSON.stringify({before, after, seq}));
  expect(true).toBe(true);
});
