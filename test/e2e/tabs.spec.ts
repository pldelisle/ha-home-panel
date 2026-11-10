// Every tab opens, on a tablet and a phone, in the full and the bare house; nothing covers the Home button; no page error.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect, tabletOnly, phoneOnly, eachShownTab, countAdded, isPhone, type House} from './fixtures';
import type {Locator} from '@playwright/test';
import {FULL_CFG} from './houses';
import {openOfficeSheet} from './lights';

// what the bare house lacks, wherever it shows: the Climate and Car tabs (rail buttons, Home tiles), the water heater and Hilo cards
// and the tiles that open them
const LACKING =
  '[data-tab="climate"], [data-tab="car"], [data-pane="climate"], [data-pane="car"], #water, #hilo, [data-card="water"], [data-card="hilo"]';

// records each of them the panel leaves shown at the end of a task that changes it (window.lackingShown): a MutationObserver's
// callback runs before the browser may paint the next frame, so what it sees is what a frame can show, whatever the timing
const recordedTest = test.extend({
  page: async ({page}, use) => {
    await page.addInitScript(sel => {
      const seen: string[] = [];
      (window as unknown as {lackingShown: string[]}).lackingShown = seen;
      const attach = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow')!
        .value as Element['attachShadow'];
      Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
        const root = attach.call(this, init);
        new MutationObserver(() =>
          root.querySelectorAll<HTMLElement>(sel).forEach(e => {
            if (!e.hidden)
              seen.push(
                `${e.id ? '#' + e.id : e.className} ${e.dataset.card ?? e.dataset.tab ?? e.dataset.pane ?? ''}`,
              );
          }),
        ).observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']});
        return root;
      };
    }, LACKING);
    await use(page);
  },
});

// a browser that remembers the Car tab, opened on a house with no car
const rememberedCar = test.extend({
  page: async ({page}, use) => {
    await page.addInitScript(() => localStorage.setItem('home-panel-tab', 'car'));
    await use(page);
  },
});

// the title each pane opens with, in the order of the rail: `<hp-pane-header>`'s heading, from the catalog, or (Car) the guest's
const TITLES = {
  en: {
    home: 'Home',
    lights: 'Lights',
    climate: 'Climate',
    weather: 'Weather',
    car: 'Car',
    energy: 'Energy',
    air: 'Air',
    media: 'Media',
    cams: 'Security',
    auto: 'Automations',
  },
  fr: {
    home: 'Maison',
    lights: 'Lumières',
    climate: 'Climat',
    weather: 'Météo',
    car: 'Voiture',
    energy: 'Énergie',
    air: 'Air',
    media: 'Médias',
    cams: 'Sécurité',
    auto: 'Automatisations',
  },
} as const;
// every shown tab's pane opens with one heading, in the header's shadow root (or slotted), whatever the language
const headings = (lang: keyof typeof TITLES) => async (house: House) => {
  await eachShownTab(house, async (tab, pane) => {
    // the pane's own header is the first; on a tablet the Weather detail draws one of its own after it, with the same heading
    await expect(pane.locator('hp-pane-header h2').first(), tab).toHaveText(
      TITLES[lang][tab as keyof (typeof TITLES)['en']],
    );
  });
};

// whether the element itself is shown: not `hidden` and not display:none (its pane may be closed, that is not the question)
const shown = (loc: Locator) =>
  expect.poll(() => loc.evaluate(e => !(e as HTMLElement).hidden && getComputedStyle(e).display !== 'none'));
// the pane is at least 50 px tall; in a house with automations the Automations pane has drawn its flow first
const tallEnough = (withFlows: boolean) => async (tab: string, pane: Locator) => {
  if (tab === 'auto' && withFlows) await expect(pane.locator('svg').first()).toBeVisible({timeout: 10_000});
  expect((await pane.boundingBox())!.height, `${tab} pane height`).toBeGreaterThan(50);
};
// nothing invisible may sit on top of the panel and swallow taps (the v1.19.6 idle overlay did); checked in every house
const homeButtonUncovered = async (house: House) => {
  const covered = await house.root().evaluate(el => {
    const root = el.shadowRoot!,
      b = root.querySelector('[data-tab="home"]')!,
      x = b.getBoundingClientRect();
    const top = root.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2);
    return !top || !(top === b || b.contains(top));
  });
  expect(covered, 'the Home tab button is covered by another element').toBe(false);
};

test.describe('full house', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('1 every tab that is shown opens a pane', async ({house}) => {
    await eachShownTab(house, tallEnough(true));
  });

  test('2 the Home tab button is the topmost element at its centre', async ({house}) => {
    await homeButtonUncovered(house);
  });

  test('3 shows who is home, the water heater and the Car tab; Hilo stays hidden', async ({house}) => {
    tabletOnly();
    await expect(house.root()).toContainText('Alex');
    await shown(house.root().locator('#water')).toBe(true);
    await shown(house.root().locator('#hilo')).toBe(false);
    await shown(house.root().locator('#rail [data-tab="car"]')).toBe(true);
  });

  // The Weather detail is an element with a root of its own. It mounts its radar map when it opens, and the container is written once;
  // a second mount would write it again (and start the radar twice). The roots are watched from the moment they are made.
  test('49 opening the Weather tab draws its inline detail once', async ({house}) => {
    tabletOnly();
    const written = await countAdded(house, 'rnote');
    await house.tab('weather');
    await expect(house.root().locator('hp-weather-detail .radar .rnote')).toBeVisible();
    // one frame more, in case a second draw was queued behind the first
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await written()).toBe(1);
  });

  // every project sets Reduce Motion; under it a tap changes the tab bar in one step. A highlight that still faded redrew the glass
  // rail for a fifth of a second after the tap, and a screenshot that ended the fade at whatever frame it had reached came out one
  // of two images (#94). A transition or animation reports itself (transitionrun, animationstart) in the frame after it starts.
  test('47 under Reduce Motion, tapping a tab starts no transition or animation in the tab bar', async ({house}) => {
    await house.root().evaluate(el => {
      const started: string[] = [];
      (window as unknown as {started: string[]}).started = started;
      for (const type of ['transitionrun', 'animationstart'])
        el.shadowRoot!.addEventListener(type, e => {
          const t = e.target as HTMLElement,
            what = e instanceof TransitionEvent ? e.propertyName : (e as AnimationEvent).animationName;
          // the rail on a tablet, the bar on a phone; a chart drawing in the pane is not the question here
          if (t.closest('#rail')) started.push(`${t.dataset.tab ?? t.localName} ${type} ${what}`);
        });
    });
    // an animation with a delay reports animationstart only after the delay, so each tap also asks the tab bar for what is queued or running now
    await eachShownTab(house, async tab => {
      const running = await house
        .root()
        .locator('#rail')
        .evaluate(el =>
          el.getAnimations({subtree: true}).map(a => {
            const t = a as CSSAnimation & CSSTransition;
            return `${a.constructor.name} ${t.animationName ?? t.transitionProperty}`;
          }),
        );
      expect(running, `${tab}: animations and transitions in the tab bar after the tap`).toEqual([]);
    });
    // one frame more, so the last tap's events have arrived
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.page.evaluate(() => (window as unknown as {started: string[]}).started)).toEqual([]);
  });

  // the glass sheet is captured right after the tap that opens it; under Reduce Motion it appears at once, on a tablet (the pop in) and
  // on a phone (the spring up, and the spring back after a short drag, which is a transition on the same panel) (#101)
  test('48 under Reduce Motion, opening the light sheet starts no transition or animation on the sheet', async ({
    house,
  }) => {
    await openOfficeSheet(house);
    const left = await house.root().evaluate(el => {
      const sheet = el.shadowRoot!.querySelector('#sh-light')!,
        panel = sheet.querySelector(':scope > .panel')!;
      return [sheet, panel].flatMap(e => {
        const c = getComputedStyle(e),
          running = e
            .getAnimations()
            .map(
              a =>
                `${a.constructor.name} ${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty}`,
            ),
          // a transition starts only when a property changes, so what the panel would run on a drag's release counts too
          set =
            c.animationName !== 'none' || c.transitionDuration.split(', ').some(d => parseFloat(d) > 0)
              ? [`${e.className || e.id}: ${c.animationName} ${c.transitionProperty} ${c.transitionDuration}`]
              : [];
        return [...running, ...set];
      });
    });
    expect(left).toEqual([]);
  });

  // The pane's header is <hp-pane-header> (#167): the heading is in its shadow root and comes from the catalog, and the line under
  // it is the guest's, a child of the header in the shell's root that its slot shows.
  test("52 every pane opens with its title as the one heading of its header, and the guest's line under it", async ({
    house,
  }) => {
    await headings('en')(house);
    await eachShownTab(house, async (tab, pane) => {
      // a tablet's Weather pane has the header of its detail too, with the summary under it
      const headers = tab === 'weather' && !isPhone(house) ? 2 : 1;
      await expect(pane.locator('hp-pane-header > [slot="sub"]'), tab).toHaveCount(headers);
    });
  });

  test('53 the Lights line stays in its header and follows the lights: a light going off changes it', async ({
    house,
  }) => {
    await house.tab('lights');
    const line = house.root().locator('hp-pane-header > #lsub');
    await expect(line).toBeVisible();
    const lit = async () => Number(/^(\d+) lights? on/.exec((await line.textContent()) ?? '')?.[1]);
    const before = await lit();
    expect(before, 'lights on before').toBeGreaterThan(1);
    await house.setState('light.office_1', {state: 'off'});
    await expect.poll(lit).toBe(before - 1);
  });

  test("54 the Car heading is the guest's: the car's name, written into the header's title slot", async ({house}) => {
    phoneOnly(); // the summary header, which only the phone shows, is where the guest writes the car's name
    await house.tab('car');
    await expect(house.root().locator('hp-pane-header > #carh2')).toHaveText('Car');
  });
});

test.describe('a named car', () => {
  test.use({houseOpts: {cfg: {...FULL_CFG, car: {...FULL_CFG.car, name: 'Roadster'}}}});

  test('55 the Car heading is the name the config gives the car', async ({house}) => {
    phoneOnly();
    await house.tab('car');
    await expect(house.root().locator('hp-pane-header > #carh2')).toHaveText('Roadster');
    await expect(house.root().locator('#pane-car hp-pane-header h2')).toHaveText('Roadster');
  });
});

test.describe('bare house', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('4 optional sections stay hidden without their entities', async ({house}) => {
    for (const sel of ['#water', '#hilo', '#rail [data-tab="car"]', '#rail [data-tab="climate"]']) {
      await shown(house.root().locator(sel)).toBe(false);
    }
  });

  // the Home tiles, and on a phone the Energy rows, are redrawn whole when their text changes; a hide that ran before the redraw let
  // these show on load and come back after every change, and the glass tiles that moved for them broke the bare-house screenshot
  recordedTest(
    '41 what the bare house lacks never shows, on load or when a change redraws its tiles',
    async ({house}) => {
      await house.tab('home');
      await house.setState('light.living_room_1', {attributes: {brightness: 100}});
      await expect(house.root().locator('#htiles [data-pane="lights"]')).toContainText('39%');
      if (test.info().project.name === 'phone') {
        // Energy is under More on a phone; its pane draws the Water heater and Hilo rows
        await house.root().locator('#moretab').click();
        await house.root().locator('#morelist hp-stat-tile[key="energy"] button').click();
        await expect(house.root().locator('#pane-energy')).toBeVisible();
        await expect(house.root().locator('#etiles [data-card="water"]')).toBeAttached();
      }
      const shown = await house.page.evaluate(() => (window as unknown as {lackingShown: string[]}).lackingShown);
      expect([...new Set(shown)], 'shown at the end of a task').toEqual([]);
    },
  );

  rememberedCar('4b a remembered tab the house lacks opens Home', async ({house}) => {
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await expect(house.root().locator('#pane-car')).toBeHidden();
    await expect(house.root().locator('#rail [data-tab="home"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('1b every tab that is shown opens a pane', async ({house}) => {
    await eachShownTab(house, tallEnough(false)); // no automations here, so no flow to wait for
  });

  test('2b the Home tab button is the topmost element at its centre', async ({house}) => {
    await homeButtonUncovered(house);
  });
});

test.describe('French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr'}});

  test('5 the rail is in French for a French-language user', async ({house}) => {
    tabletOnly();
    await expect(house.root().locator('#rail')).toContainText(/Accueil|Lumières|Climat/);
    await homeButtonUncovered(house);
  });

  // The test house has a closed door, a hall sensor that sees motion and no camera. The line is English fragments joined with
  // " · " and translated as one text node: a part without its own entry stayed English, and the sensor-row form put a colon in
  // it. The whole line is compared, so an English word or a colon left in it fails the test.
  test('42 the Security card on Home reads in French, with no English word and no colon', async ({house}) => {
    await house.tab('home');
    await expect(house.root().locator('#hsec .right')).toHaveText('toutes les portes fermées · mouvement en cours');
  });

  test('43 the Security pane reads in French, with no English word and no colon', async ({house}) => {
    tabletOnly();
    await house.tab('cams');
    await expect(house.root().locator('#cmsub')).toHaveText(
      'Aucune caméra · toutes les portes fermées · mouvement en cours',
    );
  });

  test('56 every pane opens with its title in French: from the catalog, and the Car one by the rewrite layer', async ({
    house,
  }) => {
    await headings('fr')(house);
  });

  test('44 the Security line under More on a phone reads in French, with no English word and no colon', async ({
    house,
  }) => {
    phoneOnly();
    await house.root().locator('#moretab').click();
    await expect(house.root().locator('#morelist hp-stat-tile[key="cams"] small')).toHaveText(
      'Portes fermées · mouvement en cours',
    );
  });
});

test.describe('dark theme', () => {
  test.use({houseOpts: {cfg: FULL_CFG, theme: 'dark'}});

  test('6 every tab opens with no page error', async ({house}) => {
    tabletOnly();
    await expect(house.root().locator('.app'), 'the theme option reached the panel').toHaveAttribute(
      'data-theme',
      'dark',
    );
    await eachShownTab(house, tallEnough(true));
    await homeButtonUncovered(house);
  });
});
