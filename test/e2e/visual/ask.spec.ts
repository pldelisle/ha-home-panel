// The Ask sheet and the header's button, one screenshot each (spec 29, #538, #539): the sheet idle, with a series answered, with a question the panel cannot place, with a question
// in flight, one that timed out and one the model is not there for, on the
// tablet and the phone, light and dark, in English and French; and the header with the button once per design (Liquid Glass and Material).
// Baselines live in test/e2e/__screenshots__/visual/ask.spec.ts/ and are recorded only inside the Playwright image (Docker or `container`).
import {test, expect, fontsLoaded} from '../fixtures';
import {
  AI_TASK,
  ASK_CFG,
  QUESTION,
  QUESTION_DOOR,
  QUESTION_DOOR_FR,
  QUESTION_DOOR_NONE,
  QUESTION_DOOR_NONE_FR,
  QUESTION_FR,
  QUESTION_TOTAL,
  QUESTION_TOTAL_FR,
  TOTAL_CFG,
  ASK_ENTITY,
  askField,
  askMessage,
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
  en: {answered: QUESTION, moments: QUESTION_DOOR, none: QUESTION_DOOR_NONE, unsupported: 'Open the garage door'},
  fr: {
    answered: QUESTION_FR,
    moments: QUESTION_DOOR_FR,
    none: QUESTION_DOOR_NONE_FR,
    unsupported: 'Ouvre la porte du garage',
  },
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

          // moments: the front door's spans of the last day with their count and total, and the plain line when a minimum length leaves none
          test('moments answered', async ({house}) => {
            await withAsk(house);
            await house.tab('lights');
            await openAsk(house);
            await sendQuestion(house, QUESTIONS[lang].moments);
            await expect(askSheet(house).locator('#ask-moments')).toBeVisible();
            await settle(house);
            await expect(house.page).toHaveScreenshot(`ask-moments-${viewport}-${theme}-${lang}.png`);
          });

          test('no moments', async ({house}) => {
            await withAsk(house);
            await house.tab('lights');
            await openAsk(house);
            await sendQuestion(house, QUESTIONS[lang].none);
            await expect(askSheet(house).locator('#ask-summary')).toBeVisible();
            await expect(askSheet(house).locator('#ask-moments')).toHaveCount(0);
            await settle(house);
            await expect(house.page).toHaveScreenshot(`ask-moments-none-${viewport}-${theme}-${lang}.png`);
          });

          // a total: the figure of a meter over the last seven days and a bar for each day (the house's energy meters are named in this test's config)
          test.describe('a total', () => {
            test.use({
              houseOpts: {
                cfg: {...TOTAL_CFG, ...(lang === 'fr' ? {names: KEEP_ENGLISH_NAMES} : {})},
                aiTask: AI_TASK,
                lang,
                theme,
                time: AFTERNOON,
                frozen: true,
              },
            });

            test('a total answered', async ({house}) => {
              await withAsk(house);
              await house.tab('lights');
              await openAsk(house);
              await sendQuestion(house, lang === 'fr' ? QUESTION_TOTAL_FR : QUESTION_TOTAL);
              await expect(askSheet(house).locator('#ask-total')).toBeVisible();
              await chartDrawn(house);
              await settle(house);
              await expect(house.page).toHaveScreenshot(`ask-total-${viewport}-${theme}-${lang}.png`);
            });
          });

          // the reply is held back for ten minutes of the page's clock, which nothing runs; under the project's reduced motion the progress dot does not breathe, so the pixels are still
          test.describe('in flight', () => {
            test.use({
              houseOpts: {
                cfg: {...ASK_CFG, ...(lang === 'fr' ? {names: KEEP_ENGLISH_NAMES} : {})},
                aiTask: {...AI_TASK, delayMs: 600_000},
                lang,
                theme,
                time: AFTERNOON,
                frozen: true,
              },
            });

            test('a question being worked out, with its Cancel', async ({house}) => {
              await withAsk(house);
              await house.tab('lights');
              await openAsk(house);
              await sendQuestion(house, QUESTIONS[lang].answered);
              await expect(askMessage(house)).toBeVisible();
              await expect(askSheet(house).locator('#ask-cancel')).toBeVisible();
              await settle(house);
              await expect(house.page).toHaveScreenshot(`ask-planning-${viewport}-${theme}-${lang}.png`);
            });

            test('a question that took too long, with Try again', async ({house}) => {
              await withAsk(house);
              await house.tab('lights');
              await openAsk(house);
              await sendQuestion(house, QUESTIONS[lang].answered);
              await expect(askMessage(house)).toBeVisible();
              await house.clock.runFor(30_001);
              await expect(askSheet(house).locator('#ask-retry')).toBeVisible();
              await settle(house);
              await expect(house.page).toHaveScreenshot(`ask-timeout-${viewport}-${theme}-${lang}.png`);
            });
          });

          test('a model that is not there, with Try again', async ({house}) => {
            await withAsk(house);
            await house.setState(ASK_ENTITY, {state: 'unavailable'});
            await house.tab('lights');
            await openAsk(house);
            await sendQuestion(house, QUESTIONS[lang].answered);
            await expect(askSheet(house).locator('#ask-retry')).toBeVisible();
            await settle(house);
            await expect(house.page).toHaveScreenshot(`ask-unavailable-${viewport}-${theme}-${lang}.png`);
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
