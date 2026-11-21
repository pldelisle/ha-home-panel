// Helpers for the Ask sheet: what the specs and the screenshots both do to the made-up house. The full test house has no `ask` block (every header baseline
// depends on it), so a test that needs one sets the config, says what the AI Task answers, and adds the entity the way Home Assistant would.
import {expect, type House} from './fixtures';
import {FULL_CFG} from './houses';

/** The AI Task entity of the test house's `ask` block: a made-up name, added to the house's states by `withAsk`. */
export const ASK_ENTITY = 'ai_task.local_model';

/** The full house, with the Ask sheet switched on. */
export const ASK_CFG = {...FULL_CFG, ask: {entity: ASK_ENTITY}};

/** What a model returns for a question about a room's temperature: the six flat fields of the wire, the unused ones null. */
export const seriesPlan = (sensor: string, period: string) => ({
  form: 'series',
  sensor,
  period,
  test: 'none',
  value: null,
  longer_than_min: null,
});

/**
 * What the AI Task answers, by a substring of the question (the instructions hold the sensors' names too, so a key is words of the question
 * alone, and none that the instructions' own examples hold, such as "how warm was the office yesterday": the office's temperature over the last 24 hours, a sensor the catalog does not have, and, for anything else, the harness's "unsupported".
 */
export const AI_TASK = {
  replies: {
    'office temperature yesterday': seriesPlan('temp.office', 'yesterday'),
    'office temperature over the last day': seriesPlan('temp.office', 'last_24h'),
    'faisait-il au bureau': seriesPlan('temp.office', 'last_24h'),
    'attic temperature': seriesPlan('temp.attic', 'last_24h'),
  },
};

/** The questions those replies answer, in English and in French. */
export const QUESTION = 'What was the office temperature over the last day?';
export const QUESTION_YESTERDAY = 'What was the office temperature yesterday?';
export const QUESTION_ATTIC = 'What was the attic temperature?';
export const QUESTION_FR = 'Quelle température faisait-il au bureau dans les dernières 24 heures ?';

export const askButton = (house: House) => house.root().locator('#ask');
export const askSheet = (house: House) => house.root().locator('hp-ask-sheet');
export const askField = (house: House) => house.root().locator('#ask-question');
export const askDialog = (house: House, name = 'Ask the history') => house.root().getByRole('dialog', {name});

/** The house has the AI Task entity: Home Assistant added it, and the header draws the button. */
export const withAsk = async (house: House) => {
  await house.setState(ASK_ENTITY, {state: 'unknown'});
  await expect(askButton(house)).toBeVisible();
};

/** Taps the button and waits for the sheet and its field. */
export const openAsk = async (house: House) => {
  await askButton(house).click();
  await expect(askField(house)).toBeVisible();
};

/** Types a question and sends it with Enter. */
export const sendQuestion = async (house: House, question: string) => {
  await askField(house).fill(question);
  await askField(house).press('Enter');
};

/** The chart of the answer is drawn. */
export const chartDrawn = (house: House) =>
  expect(askSheet(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();

/** After a tap: the pointer is moved off the control, and the animations are awaited, so no hover layer is in a screenshot. */
export const settle = async (house: House) => {
  await house.page.mouse.move(0, 0);
  await house.page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
};
