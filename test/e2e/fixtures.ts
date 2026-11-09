// The `house` fixture: opens the made-up house the way Home Assistant would hand it to the panel, records what the panel
// sends back (service calls, system-data writes, page errors) and fails the test on any page error.
// Tests drive the panel through what a person touches and what Home Assistant does (a new `hass`, time passing): never
// through the element's methods.
import {test as base, expect, type Locator, type Page} from '@playwright/test';
import {PHONE_TABS, TABLET_TABS} from './houses';
import {GOOGLE_FONT_HOSTS} from '../google-font-hosts.mjs';

// what harness.html reads before the panel loads, and the helper it exposes afterwards
declare global {
  interface Window {
    PANEL_CFG: object | null;
    SYSDATA: object | null;
    house: {setState(entityId: string, patch: object): void; setLanguage(lang: string): void};
  }
}

/** where Vite puts the lazy chunks in the served panel (dist/chunks/, served under /panel/) */
export const CHUNK_URL = /\/panel\/chunks\//;
/** the chunk Mermaid's formula typesetter (KaTeX) is in: asked for only by a label with `$$…$$`, never by the panel's own flows */
export const KATEX_CHUNK_URL = /\/panel\/chunks\/katex-/;

/** a chunk the panel fetched from dist/chunks/: its URL and its source text */
export type Chunk = {url: string; body: string};

/** where the build puts Montserrat in the served panel (dist/fonts/, served under /panel/) */
export const FONT_URL = /\/panel\/fonts\//;

/** the weights the panel's stylesheet uses, which src/fonts.js declares, as `document.fonts` writes them */
export const FONT_WEIGHTS = ['400', '500', '600', '700'];

// a request to Google's font hosts fails the test (spec 08)
const isGoogleFont = (url: string | URL) => GOOGLE_FONT_HOSTS.includes(new URL(url).hostname);

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
  /** the full house's automations ({entity_id, config} each), served in place of test/e2e/automations.json */
  automations?: object[];
  /** a daily forecast for today and the next five days, which the weather subscription delivers (spec 11, day names) */
  forecast?: boolean;
  /** a second panel on the same page (`page.locator('home-panel').nth(1)`), with two rooms and one person (spec 10) */
  two?: boolean;
};

export type House = {
  page: Page;
  /** service calls the panel made: "domain.service {json}" */
  calls: string[];
  /** frontend/set_system_data messages the panel sent */
  ws: Array<{type: string; key: string; value: unknown}>;
  /** page errors and console errors; the fixture asserts this is empty after the test */
  errors: string[];
  /** the URLs the panel asked for under /panel/chunks/ (lazy chunks), in the order it asked, whether or not they arrived */
  chunkRequests: string[];
  /** the lazy chunks that arrived, with their text, in the order their bodies arrived */
  chunks: Chunk[];
  /** the URLs of the fetched chunks whose body contains `needle` (a string, or a pattern) */
  chunksWith: (needle: string | RegExp) => string[];
  /** every font file the page received, wherever it came from (the bundled Montserrat is under /panel/fonts/), in order */
  fonts: Array<{url: string; status: number}>;
  /** the panel element */
  root: () => Locator;
  /** taps the tab's button (rail or phone bar) and waits for its pane */
  tab: (name: string) => Promise<void>;
  /** what Home Assistant does on a state change: a new state object inside a new hass object */
  setState: (entityId: string, patch: object) => Promise<void>;
  /** the signed-in user's profile language changes ('fr' draws the panel again in French); later setState calls keep it */
  setLanguage: (lang: 'en' | 'fr') => Promise<void>;
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
      errors: string[] = [],
      chunkRequests: string[] = [],
      chunks: Chunk[] = [],
      fonts: House['fonts'] = [];
    await page.addInitScript(
      ([cfg, sysdata, theme]) => {
        window.PANEL_CFG = cfg;
        window.SYSDATA = sysdata;
        try {
          localStorage.setItem('home-panel-theme', theme);
        } catch {
          // storage is blocked: the panel keeps its default theme
        }
      },
      [o.cfg ?? null, o.sysdata ?? null, o.theme] as const,
    );
    // a Google Fonts request fails the test; it is also aborted, so that a run never depends on the internet
    page.on('request', r => {
      if (isGoogleFont(r.url())) errors.push(`Google Fonts request: ${r.url()}`);
    });
    await page.route(isGoogleFont, r => r.abort());
    page.on('response', r => {
      if (r.request().resourceType() === 'font') fonts.push({url: r.url(), status: r.status()});
    });
    if (o.automations) {
      const body = JSON.stringify(o.automations);
      await page.route(/\/automations\.json$/, r => r.fulfill({contentType: 'application/json', body}));
    }
    // the body is read as the response arrives, so a test can tell the chunk that holds a library from one that does not
    page.on('request', r => {
      if (CHUNK_URL.test(r.url())) chunkRequests.push(r.url());
    });
    page.on('response', r => {
      if (CHUNK_URL.test(r.url()))
        r.text().then(
          body => chunks.push({url: r.url(), body}),
          (e: Error) => {
            // the page closed before the body arrived (the test is over); any other failure is the fixture's to report
            if (!/closed/i.test(e.message)) errors.push(`reading ${r.url()}: ${e.message}`);
          },
        );
    });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      const t = m.text();
      if (t.startsWith('SERVICE ')) calls.push(t.slice(8));
      else if (t.startsWith('WS ')) ws.push(JSON.parse(t.slice(3)) as House['ws'][number]);
      else if (m.type() === 'error' && !/Failed to load resource/.test(t)) errors.push(t);
    });
    if (o.time) await page.clock.install({time: new Date(o.time)});
    if (o.time && o.frozen) await page.clock.setFixedTime(new Date(o.time));
    await page.goto(
      `/?house=${o.house}&lang=${o.lang}&admin=${o.admin ? 1 : 0}${o.two ? '&two=1' : ''}${o.forecast ? '&forecast=1' : ''}`,
    );
    const root = () => page.locator('home-panel');
    await root().locator('#rail').first().waitFor({state: 'attached'});
    const house: House = {
      page,
      calls,
      ws,
      errors,
      chunkRequests,
      chunks,
      fonts,
      chunksWith: needle =>
        chunks
          .filter(c => (typeof needle === 'string' ? c.body.includes(needle) : needle.test(c.body)))
          .map(c => c.url),
      root,
      clock: page.clock,
      tab: async name => {
        await root().locator(`[data-tab="${name}"]`).first().click();
        await expect(root().locator(`#pane-${name}`)).toBeVisible();
      },
      setState: (id, patch) => page.evaluate(([id, patch]) => window.house.setState(id, patch), [id, patch] as const),
      setLanguage: lang => page.evaluate(lang => window.house.setLanguage(lang), lang),
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

/**
 * The weights of Montserrat the document has loaded, sorted. Not `document.fonts.check()`: in Chromium it is true for a
 * family no rule declares at all, so it would pass with the font gone. A loaded face is one whose file arrived.
 */
export const loadedFontWeights = (house: House) =>
  house.page.evaluate(() =>
    [...document.fonts]
      .filter(f => f.family.replaceAll(/["']/g, '') === 'Montserrat' && f.status === 'loaded')
      .map(f => f.weight)
      .sort(),
  );

// Waits until Montserrat is loaded in all four weights. The font is declared with font-display: swap, so text is drawn
// in the fallback until a weight arrives; a screenshot must never catch that, and a chart or a flow drawn later must
// measure its labels in the real font (ApexCharts and Mermaid size boxes and axes from the text). document.fonts.load
// fetches a weight the page has not used yet and resolves when it is there; it rejects when a file cannot be fetched.
export async function fontsLoaded(house: House) {
  await house.page.evaluate(async weights => {
    await Promise.all(weights.map(w => document.fonts.load(`${w} 16px Montserrat`)));
    await document.fonts.ready;
  }, FONT_WEIGHTS);
  expect(await loadedFontWeights(house), 'Montserrat weights loaded').toEqual(FONT_WEIGHTS);
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
