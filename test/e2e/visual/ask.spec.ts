// The Ask sheet and the header's button, one screenshot each (spec 29, #538): the sheet idle, with a series answered and with a question the panel cannot place, on the
// tablet and the phone, light and dark, in English and French; and the header with the button once per design (Liquid Glass and Material).
// Baselines live in test/e2e/__screenshots__/visual/ask.spec.ts/ and are recorded only inside the Playwright image (Docker or `container`).
import {test, expect, fontsLoaded} from '../fixtures';
import {
  AI_TASK,
  ASK_CFG,
  QUESTION,
  QUESTION_FR,
  askField,
  askSheet,
  chartDrawn,
  openAsk,
  sendQuestion,
  settle,
  withAsk,
} from '../ask';
import {AFTERNOON, KEEP_ENGLISH_NAMES, VIEWPORTS} from '../houses';

// every screenshot shows the bundled Manrope, never the fallback it swaps from (font-display: swap)
test.beforeEach(({house}) => fontsLoaded(house));

const QUESTIONS = {
  en: {answered: QUESTION, unsupported: 'Open the garage door'},
  fr: {answered: QUESTION_FR, unsupported: 'Ouvre la porte du garage'},
} as const;

for (const viewport of ['tablet', 'phone'] as const) {
  test.describe(viewport, () => {
    test.use({viewport: VIEWPORTS[viewport]});

    for (const theme of ['light', 'dark'] as const) {
      for (const lang of ['en', 'fr'] as const) {
        test.describe(`${theme}, ${lang}`, () => {
          // the clock is frozen at the afternoon of the test house, so the chart's axis and curve are the same pixels on every run; the French house keeps the English room names, as its other baselines do
          test.use({
            houseOpts: {
              cfg: {...ASK_CFG, ...(lang === 'fr' ? {names: KEEP_ENGLISH_NAMES} : {})},
              aiTask: AI_TASK,
              lang,
              theme,
              time: AFTERNOON,
              frozen: true,
            },
          });

          test('the sheet idle', async ({house}) => {
            await withAsk(house);
            await house.tab('lights'); // the page behind the sheet is the Lights tab, whose glass is the calmest the sheet's backdrop shows
            await openAsk(house);
            await expect(askField(house)).toBeFocused();
            await settle(house);
            await expect(house.page).toHaveScreenshot(`ask-idle-${viewport}-${theme}-${lang}.png`);
          });

          test('a series answered', async ({house}) => {
            await withAsk(house);
            await house.tab('lights'); // the page behind the sheet is the Lights tab, whose glass is the calmest the sheet's backdrop shows
            await openAsk(house);
            await sendQuestion(house, QUESTIONS[lang].answered);
            await expect(askSheet(house).locator('#ask-summary')).toBeVisible();
            await chartDrawn(house);
            await settle(house);
            await expect(house.page).toHaveScreenshot(`ask-series-${viewport}-${theme}-${lang}.png`);
          });

          test('a question the panel cannot place', async ({house}) => {
            await withAsk(house);
            await house.tab('lights'); // the page behind the sheet is the Lights tab, whose glass is the calmest the sheet's backdrop shows
            await openAsk(house);
            await sendQuestion(house, QUESTIONS[lang].unsupported);
            await expect(askSheet(house).locator('#ask-message')).toBeVisible();
            await settle(house);
            await expect(house.page).toHaveScreenshot(`ask-unsupported-${viewport}-${theme}-${lang}.png`);
          });
        });
      }
    }

    // the header with the button, once per design: on the phone, where the chips already crowd the row, as much as on the tablet
    for (const design of ['apple', 'material'] as const) {
      test.describe(`header, ${design}`, () => {
        test.use({houseOpts: {cfg: ASK_CFG, aiTask: AI_TASK, design, time: AFTERNOON, frozen: true}});

        test('the Ask button after the chips', async ({house}) => {
          await withAsk(house);
          await settle(house);
          await expect(house.root().locator('header.head')).toHaveScreenshot(`ask-header-${viewport}-${design}.png`);
        });
      });
    }
  });
}
