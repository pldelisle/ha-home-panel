// The `house` fixture: opens the made-up house the way Home Assistant would hand it to the panel, records what the panel
// sends back (service calls, system-data writes, page errors) and fails the test on any page error.
// Tests drive the panel through what a person touches and what Home Assistant does (a new `hass`, time passing): never
// through the element's methods.
import {test as base, expect, type Locator, type Page} from '@playwright/test';
import {PHONE_TABS, TABLET_TABS} from './houses';

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
  /**
   * with `time`: also stop `Date` from moving, so anything drawn from "now" (chart axes, history curves) is the same pixels on every run.
   * Timers still run, and clock.runFor / fastForward still fire them, but `Date` stays at `time` throughout: do not use it for a test
   * that needs "now" to advance (the idle clock, "ago" texts).
   */
  frozen?: boolean;
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

const DEFAULTS: Required<Pick<HouseOpts, 'house' | 'lang' | 'theme' | 'admin'>> = {
  house: 'full',
  lang: 'en',
  theme: 'light',
  admin: true,
};

export const test = base.extend<{houseOpts: HouseOpts; house: House}>({
  houseOpts: [{}, {option: true}],
  house: async ({page, houseOpts}, use) => {
    const o = {...DEFAULTS, ...houseOpts};
    const calls: string[] = [],
      ws: House['ws'] = [],
      errors: string[] = [];
    await page.addInitScript(
      ([cfg, sysdata, theme]) => {
        window.PANEL_CFG = cfg;
        window.SYSDATA = sysdata;
        try {
          localStorage.setItem('home-panel-theme', theme);
        } catch {}
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
    if (o.time && o.frozen) await page.clock.setFixedTime(new Date(o.time));
    await page.goto(`/?house=${o.house}&lang=${o.lang}&admin=${o.admin ? 1 : 0}`);
    const root = () => page.locator('home-panel');
    await root().locator('#rail').waitFor({state: 'attached'});
    const house: House = {
      page,
      calls,
      ws,
      errors,
      root,
      clock: page.clock,
      tab: async name => {
        await root().locator(`[data-tab="${name}"]`).first().click();
        await expect(root().locator(`#pane-${name}`)).toBeVisible();
      },
      setState: (id, patch) => page.evaluate(([id, patch]) => window.house.setState(id, patch), [id, patch] as const),
      setStateSince: (id, patch, agoMs) =>
        page.evaluate(
          ([id, patch, agoMs]) =>
            window.house.setState(id, {...patch, last_changed: new Date(Date.now() - agoMs).toISOString()}),
          [id, patch, agoMs] as const,
        ),
    };
    await use(house);
    expect(errors, 'page errors').toEqual([]);
  },
});

// opens each tab the screen offers (a tab button hidden on purpose, no car say, is skipped; one that is merely invisible is not)
// and runs `each` on it; returns the tabs it opened, in order
export async function eachShownTab(
  house: House,
  each?: (tab: string, pane: Locator) => Promise<void>,
): Promise<string[]> {
  const tabs = house.page.viewportSize()!.width < 600 ? PHONE_TABS : TABLET_TABS;
  const opened: string[] = [];
  for (const t of tabs) {
    const button = house.root().locator(`[data-tab="${t}"]`).first();
    if (!(await button.count()) || (await button.evaluate(e => (e as HTMLElement).hidden))) continue;
    await house.tab(t);
    opened.push(t);
    if (each) await each(t, house.root().locator(`#pane-${t}`));
  }
  return opened;
}

// skip a test (or a describe's tests, as a beforeEach) on the wrong project, for checks about one layout
export const tabletOnly = () => test.skip(test.info().project.name === 'phone', 'tablet layout');
export const phoneOnly = () => test.skip(test.info().project.name !== 'phone', 'phone layout');

// the panel shows its idle clock after this long without a touch
export const IDLE_AFTER_MS = 5 * 60_000;

// asserts the panel sent a service call ("domain.service {json}") matching `re`; on failure the report lists the calls it did
// send, and the boxed step points at the spec's line rather than this one
export const expectCall = (house: House, re: RegExp) =>
  test.step(
    `the panel sent a service call matching ${re}`,
    () => expect.poll(() => house.calls).toContainEqual(expect.stringMatching(re)),
    {box: true},
  );

export {expect};
