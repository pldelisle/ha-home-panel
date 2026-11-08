// The `house` fixture: opens the made-up house the way Home Assistant would hand it to the panel, records what the panel
// sends back (service calls, system-data writes, page errors) and fails the test on any page error.
// Tests drive the panel through what a person touches and what Home Assistant does (a new `hass`, time passing): never
// through the element's methods.
import {test as base, expect, type Locator, type Page} from '@playwright/test';

// what harness.html reads before the panel loads, and the helper it exposes afterwards
declare global {
  interface Window {
    PANEL_CFG: object | null;
    SYSDATA: object | null;
    house: {setState(entityId: string, patch: object): void};
  }
}

export type HouseOpts = {
  /** which made-up house: everything, or only the sun, one weather entity and one light */
  house?: 'full' | 'bare';
  /** the panel's `config:` block */
  cfg?: object | null;
  lang?: 'en' | 'fr';
  theme?: 'light' | 'dark';
  /** whether the signed-in user is an admin */
  admin?: boolean;
  /** an ISO instant; when set, the page's clock is faked at it before the panel loads */
  time?: string;
  /** the frontend's system data to start from, e.g. {home_panel: {light_order: [...]}} */
  sysdata?: object;
};

export type House = {
  page: Page;
  /** service calls the panel made: "domain.service {json}" */
  calls: string[];
  /** frontend/set_system_data messages the panel sent */
  ws: Array<{type: string; key: string; value: unknown}>;
  /** page errors and console errors; the fixture asserts this is empty after the test */
  errors: string[];
  /** the panel element */
  root: () => Locator;
  /** taps the tab's button (rail or phone bar) and waits for its pane */
  tab: (name: string) => Promise<void>;
  /** what Home Assistant does on a state change: a new state object inside a new hass object */
  setState: (entityId: string, patch: object) => Promise<void>;
  /** setState, with last_changed set `agoMs` before now on the page's own clock (faked or not) */
  setStateSince: (entityId: string, patch: object, agoMs: number) => Promise<void>;
  clock: Page['clock'];
};

const DEFAULTS: Required<Pick<HouseOpts, 'house' | 'lang' | 'theme' | 'admin'>> = {house: 'full', lang: 'en', theme: 'light', admin: true};

export const test = base.extend<{houseOpts: HouseOpts; house: House}>({
  houseOpts: [{}, {option: true}],
  house: async ({page, houseOpts}, use) => {
    const o = {...DEFAULTS, ...houseOpts};
    const calls: string[] = [], ws: House['ws'] = [], errors: string[] = [];
    await page.addInitScript(
      ([cfg, sysdata, theme]) => {
        window.PANEL_CFG = cfg;
        window.SYSDATA = sysdata;
        try { localStorage.setItem('home-panel-theme', theme); } catch {}
      },
      [o.cfg ?? null, o.sysdata ?? null, o.theme] as const,
    );
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      const t = m.text();
      if (t.startsWith('SERVICE ')) calls.push(t.slice(8));
      else if (t.startsWith('WS ')) ws.push(JSON.parse(t.slice(3)));
      else if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(t)) errors.push(t);
    });
    if (o.time) await page.clock.install({time: new Date(o.time)});
    await page.goto(`/?house=${o.house}&lang=${o.lang}&admin=${o.admin ? 1 : 0}`);
    const root = () => page.locator('home-panel');
    await root().locator('#rail').waitFor({state: 'attached'});
    const house: House = {
      page, calls, ws, errors, root, clock: page.clock,
      tab: async name => {
        await root().locator(`[data-tab="${name}"]`).first().click();
        await expect(root().locator(`#pane-${name}`)).toBeVisible();
      },
      setState: (id, patch) => page.evaluate(([id, patch]) => window.house.setState(id, patch), [id, patch] as const),
      setStateSince: (id, patch, agoMs) => page.evaluate(
        ([id, patch, agoMs]) => window.house.setState(id, {...patch, last_changed: new Date(Date.now() - agoMs).toISOString()}),
        [id, patch, agoMs] as const,
      ),
    };
    await use(house);
    expect(errors, 'page errors').toEqual([]);
  },
});

// skips the test on the phone project, for checks that are about the tablet layout
export const tabletOnly = () => test.skip(test.info().project.name === 'phone', 'tablet layout');

// asserts the panel sent a service call ("domain.service {json}") matching `re`; on failure the report lists the calls it did send
export const expectCall = (house: House, re: RegExp) => expect.poll(() => house.calls, {message: `a service call matching ${re}`}).toContainEqual(expect.stringMatching(re));

export {expect};
