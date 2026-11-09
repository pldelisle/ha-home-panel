// #79: labels that used to be cut off with an ellipsis in the made-up house now show in full.
// The scan from the issue: every element of the Home and Lights panes with text-overflow: ellipsis and scrollWidth >
// clientWidth is listed; none of the labels named in the issue may be among them. The three that now wrap (a phone's light
// tile name and sub-line, the phone's Security line) have a line clamp, so they are checked for text past their last line. Run in the tablet and the phone project, in English and in French.
import {test, expect, tabletOnly, phoneOnly, fontsLoaded, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.beforeEach(({house}) => fontsLoaded(house));

/** the text of every element in the pane that cuts what it says */
const cutLabels = (house: House, tab: 'home' | 'lights') =>
  house
    .root()
    .locator(`#pane-${tab}, #sc`)
    .evaluateAll(panes => {
      const out: string[] = [];
      for (const pane of panes)
        for (const e of pane.querySelectorAll<HTMLElement>('*')) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || !e.textContent.trim()) continue;
          const widthCut = cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth;
          const wrapCut =
            e.matches('.lcell .tx b, .lcell .tx small, .hsec > .hh .right') && e.scrollHeight > e.clientHeight + 1;
          if (widthCut || wrapCut) out.push(e.textContent.trim());
        }
      return out;
    });

// the labels the issue names, per language: none may be cut
const NAMED = {
  en: ['Living room'],
  fr: ['4 allumées', 'Il y a 2 h', 'Lancer', 'En lecture', 'toutes les portes fermées · mouvement en cours'],
};

for (const lang of ['en', 'fr'] as const) {
  test.describe(`full house, ${lang}`, () => {
    test.use({houseOpts: {cfg: FULL_CFG, lang, time: AFTERNOON, frozen: true}});

    test('the Home tab cuts none of the labels the issue names', async ({house}) => {
      await house.tab('home');
      const cut = await cutLabels(house, 'home');
      for (const name of NAMED[lang]) expect(cut, `"${name}" is cut`).not.toContain(name);
      expect(cut, 'labels cut on Home').toEqual([]);
    });

    test('the Lights tab cuts none of the labels the issue names', async ({house}) => {
      await house.tab('lights');
      // the lit kitchen tile: its sub-line is drawn in full (the phone drops the colour temperature) and is not among the cut labels
      const phone = test.info().project.name === 'phone';
      const sub = {
        en: phone ? '2 of 3 on · 59%' : '2 of 3 on · 59% · 3000 K',
        fr: phone ? '2 sur 3 allumées · 59\u202f%' : '2 sur 3 allumées · 59\u202f% · 3000 K',
      }[lang];
      // (found by its area id: in French the rooms read Bureau, Cuisine, Salon, so the kitchen is no longer the first lit tile)
      await expect(house.root().locator('.lcell.on[data-lsheet="kitchen"] .tx small:visible').first()).toHaveText(sub);
      const cut = await cutLabels(house, 'lights');
      for (const name of [...NAMED[lang], sub]) expect(cut, `"${name}" is cut`).not.toContain(name);
      expect(cut, 'labels cut on Lights').toEqual([]);
    });
  });
}

test.describe('phone', () => {
  test.beforeEach(phoneOnly);
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('the Living room tile wraps its name to two lines and drops the colour temperature', async ({house}) => {
    await house.tab('lights');
    const name = house.root().locator('.lcell .tx b:visible', {hasText: 'Living room'});
    await expect(name).toBeVisible();
    // two lines of 15 px text, not one cut line
    expect(await name.evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThan(24);
    expect(await name.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    const sub = house.root().locator('.lcell.on .tx small:visible').first();
    await expect(sub).toContainText('2 of 3 on · 59%');
    await expect(sub).not.toContainText('K');
  });

  test('the Home tile values are 24 px', async ({house}) => {
    await house.tab('home');
    const sizes = await house
      .root()
      .locator('.htile .hv')
      .evaluateAll(es => es.map(e => getComputedStyle(e).fontSize));
    expect(sizes.length).toBeGreaterThan(0);
    expect(new Set(sizes)).toEqual(new Set(['24px']));
  });
});

test.describe('tablet', () => {
  test.beforeEach(tabletOnly);
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('the Lights tile keeps its colour temperature; the Home tile values are 32 px', async ({house}) => {
    await house.tab('lights');
    await expect(house.root().locator('.lcell.on .tx small:visible').first()).toContainText('2 of 3 on · 59% · 3000 K');
    await house.tab('home');
    const sizes = await house
      .root()
      .locator('.htile .hv')
      .evaluateAll(es => es.map(e => getComputedStyle(e).fontSize));
    expect(sizes.length).toBeGreaterThan(0);
    expect(new Set(sizes)).toEqual(new Set(['32px']));
  });
});
