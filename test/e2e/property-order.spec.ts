// The panel draws as many times as it did when it was the element itself: Home Assistant sets `panel` first, so it draws once with the
// config; the harness sets `hass` first and the config after, so it draws twice, once without it. The shell replays the properties in
// the order they were set; a replay in a fixed order would change one of the two. A draw is a new `#app` in the shadow root.
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';

type Property = 'panel' | 'hass' | 'narrow';

test.use({houseOpts: {cfg: FULL_CFG}});

/** a second panel on the page, given its properties in this order, and the number of times it drew its frame */
async function draws(page: import('@playwright/test').Page, order: Property[]) {
  return page.evaluate(async order => {
    const el = document.createElement('home-panel');
    let n = 0;
    const attach = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow')!.value as Element['attachShadow'];
    Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
      const root = attach.call(this, init);
      if (this === el)
        new MutationObserver(ms =>
          ms.forEach(m =>
            m.addedNodes.forEach(node => {
              if (node instanceof Element && node.id === 'app') n++;
            }),
          ),
        ).observe(root, {childList: true, subtree: true});
      return root;
    };
    const values = {
      panel: window.PANEL_CFG ? {config: window.PANEL_CFG} : {},
      hass: (window as unknown as {hass: object}).hass,
      narrow: false,
    };
    for (const k of order) (el as unknown as Record<string, unknown>)[k] = values[k];
    document.body.appendChild(el);
    await new Promise(done => setTimeout(done, 300));
    Element.prototype.attachShadow = attach;
    return n;
  }, order);
}

test('Home Assistant sets panel first: one draw, with the config', async ({house}) => {
  expect(await draws(house.page, ['panel', 'hass', 'narrow'])).toBe(1);
});

test('the harness sets hass first and panel last: two draws, the first without the config', async ({house}) => {
  expect(await draws(house.page, ['hass', 'narrow', 'panel'])).toBe(2);
});
