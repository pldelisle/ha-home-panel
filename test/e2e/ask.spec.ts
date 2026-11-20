// The Ask sheet, end to end (spec 29, "The elements"; #538): the header's button, the sheet, and a chart for a typed question, in English and French, against the harness's AI Task
// (test/houses/ai-task.mjs). The panel is driven the way a person drives it: taps, typing, Enter and Escape. The axe scans of the sheet are a11y.spec.ts's, which scans every sheet.
import {test, expect, eachShownTab, isPhone} from './fixtures';
import {AFTERNOON, FULL_CFG, KEEP_ENGLISH_NAMES} from './houses';
import {
  AI_TASK,
  ASK_CFG,
  ASK_ENTITY,
  QUESTION,
  QUESTION_ATTIC,
  QUESTION_YESTERDAY,
  QUESTION_FR,
  aiTaskNow,
  askButton,
  askMessage,
  askDialog,
  askField,
  askSheet,
  chartDrawn,
  openAsk,
  sendQuestion,
  withAsk,
} from './ask';

const UNSUPPORTED_EN = 'The panel has no sensor for that, or cannot look that up yet.';

test.describe('a house without an ask block', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('the full house has no Ask button on any tab', async ({house}) => {
    await expect(house.root().locator('#gear')).toBeVisible();
    await eachShownTab(house, async () => {
      await expect(askButton(house)).toHaveCount(0);
    });
  });
});

test.describe('the bare house', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('has no Ask button', async ({house}) => {
    await expect(house.root().locator('#gear')).toBeVisible();
    await expect(askButton(house)).toHaveCount(0);
  });
});

test.describe('an ask block whose entity is not in the house', () => {
  test.use({houseOpts: {cfg: ASK_CFG}});

  test('draws no button until Home Assistant has the entity', async ({house}) => {
    await expect(house.root().locator('#gear')).toBeVisible();
    await expect(askButton(house)).toHaveCount(0);
    await withAsk(house);
  });
});

test.describe('a house with an ask block', () => {
  test.use({houseOpts: {cfg: ASK_CFG, aiTask: AI_TASK, time: AFTERNOON}});

  test('draws the button on every tab, named for a screen reader', async ({house}) => {
    await withAsk(house);
    await expect(askButton(house)).toHaveAccessibleName('Ask the history');
    const tabs = await eachShownTab(house, async () => {
      await expect(askButton(house)).toBeVisible();
    });
    expect(tabs.length).toBeGreaterThan(1);
  });

  test('a typed question draws the chart, its low and high, the mean and what the panel understood', async ({
    house,
  }) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    const sheet = askSheet(house);
    await expect(sheet.locator('#ask-summary')).toHaveText(/^Office · last 24 hours · \d+\.\d° to \d+\.\d°$/);
    await expect(sheet.locator('#ask-mean')).toHaveText(/^Mean \d+\.\d°$/);
    await expect(sheet.locator('#ask-understood')).toHaveText('Office · over time · last 24 hours');
    await chartDrawn(house);
    // the answer is in a polite live region, so a screen reader hears it arrive
    await expect(sheet.locator('#ask-result')).toHaveAttribute('aria-live', 'polite');
    await expect(sheet.locator('#ask-result #ask-summary')).toBeVisible();
    // one question, one call to the AI Task
    expect(await house.generated()).toHaveLength(1);
  });

  test('a period the recorder only partly holds is answered for the part it has, and says so', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    // the test house's recorder holds 25 hours of five-minute rows, so "yesterday" is only its last hours
    await sendQuestion(house, QUESTION_YESTERDAY);
    await expect(askSheet(house).locator('#ask-summary')).toHaveText(/^Office · yesterday · /);
    await expect(askSheet(house).locator('#ask-coverage')).toHaveText(/^History starts .+/);
  });

  test('the keyboard is enough: the field has focus on open, Enter sends, Escape closes and gives focus back', async ({
    house,
  }) => {
    await withAsk(house);
    await askButton(house).focus();
    await house.page.keyboard.press('Enter');
    await expect(askField(house)).toBeFocused();
    await expect(askButton(house)).toHaveAttribute('aria-expanded', 'true');
    await house.page.keyboard.type(QUESTION);
    await house.page.keyboard.press('Enter');
    await expect(askSheet(house).locator('#ask-summary')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(askDialog(house)).toBeHidden();
    await expect(askButton(house)).toBeFocused();
    await expect(askButton(house)).toHaveAttribute('aria-expanded', 'false');
  });

  test('the sheet closes with its close button and with a tap outside, as the other sheets do', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await askDialog(house).getByRole('button', {name: 'Close'}).click();
    await expect(askDialog(house)).toBeHidden();

    await openAsk(house);
    // a tap on the backdrop: the corner of the screen, beside (or above) the panel
    await askSheet(house)
      .locator('hp-sheet .sheet')
      .click({position: {x: 4, y: 4}});
    await expect(askDialog(house)).toBeHidden();
  });

  test('what leaves the panel is the question, the date and the sensor names: no entity id of the house and no reading', async ({
    house,
  }) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await expect(askSheet(house).locator('#ask-summary')).toBeVisible();

    const [call] = await house.generated();
    expect(call).toMatchObject({domain: 'ai_task', service: 'generate_data', returnResponse: true});
    const sent = JSON.stringify(call.data);
    // the AI Task is the one entity addressed; no other id of the house is in what was sent
    expect(call.data.entity_id).toBe(ASK_ENTITY);
    // no entity id of the house: not one of the ids in its states, the AI Task entity aside (it is what the call addresses, in `entity_id`)
    const states = await house.page.evaluate(() =>
      Object.entries((window as unknown as {hass: {states: Record<string, {state: string}>}}).hass.states).map(
        ([id, entity]) => [id, entity.state] as const,
      ),
    );
    expect(states.length).toBeGreaterThan(50);
    const ids = states.map(([id]) => id).filter(id => id !== ASK_ENTITY && sent.includes(id));
    expect(ids).toEqual([]);
    // the question is in it, and so are the handles the model answers with
    expect(sent).toContain(QUESTION);
    expect(sent).toContain('temp.office');
    // no reading: every numeric state of the house of two characters or more (decimals and integers) is nowhere in what was sent, as a number of its own. The numbers the
    // instructions hold themselves (their examples, the question's, the date's) are not readings, and are told by being in the text with every sensor's line and the question taken out.
    const readings = [
      ...new Set(states.map(([, state]) => state).filter(state => /^-?\d+(\.\d+)?$/.test(state) && state.length >= 2)),
    ];
    expect(readings.length).toBeGreaterThan(5);
    const own = (call.data.instructions as string).replace(QUESTION, '').replace(/^- (?:temp|power)\..*$/gm, '');
    const asNumber = (text: string, reading: string) =>
      new RegExp(`(?<![\\w.-])${reading.replace('.', '\\.')}(?![\\w.])`).test(text);
    for (const reading of readings.filter(reading => !asNumber(own, reading)))
      expect(asNumber(sent, reading), `the reading ${reading}`).toBe(false);
  });

  test('a sensor the catalog does not have is refused: the sheet says it cannot answer, and the model’s words are not shown', async ({
    house,
  }) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION_ATTIC);
    await expect(askSheet(house).locator('#ask-message')).toHaveText(UNSUPPORTED_EN);
    await expect(askSheet(house).locator('hp-ask-answer')).toHaveCount(0);
    await expect(askSheet(house)).not.toContainText('temp.attic');
  });

  test('a question the table does not answer is unsupported too', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, 'Open the garage door');
    await expect(askSheet(house).locator('#ask-message')).toHaveText(UNSUPPORTED_EN);
  });

  test('the sheet opens empty the second time, and the next person reads no question', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await expect(askSheet(house).locator('#ask-summary')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(askDialog(house)).toBeHidden();

    await openAsk(house);
    await expect(askField(house)).toHaveValue('');
    await expect(askSheet(house).locator('hp-ask-answer')).toHaveCount(0);
    await expect(askSheet(house).locator('#ask-message')).toHaveCount(0);
    // the first question was asked once: opening the sheet asks the model nothing
    expect(await house.generated()).toHaveLength(1);
  });

  test('the field takes a question of at most as many characters as the model is given', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await expect(askField(house)).toHaveAttribute('maxlength', '200');
  });
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: {...ASK_CFG, names: KEEP_ENGLISH_NAMES}, lang: 'fr', aiTask: AI_TASK, time: AFTERNOON}});

  test('a typed question draws the chart and every line of the answer in French', async ({house}) => {
    await withAsk(house);
    await expect(askButton(house)).toHaveAccessibleName("Interroger l'historique");
    await openAsk(house);
    await expect(askDialog(house, "Interroger l'historique")).toBeVisible();
    await sendQuestion(house, QUESTION_FR);
    const sheet = askSheet(house);
    await expect(sheet.locator('#ask-summary')).toHaveText(/^Office · dernières 24 heures · \d+,\d° à \d+,\d°$/);
    await expect(sheet.locator('#ask-mean')).toHaveText(/^Moyenne \d+,\d°$/);
    await expect(sheet.locator('#ask-understood')).toHaveText('Office · au fil du temps · dernières 24 heures');
    await chartDrawn(house);
  });

  test('a question the panel cannot place is said in French', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, 'Ouvre la porte du garage');
    await expect(askSheet(house).locator('#ask-message')).toContainText("Le panneau n'a pas de capteur pour cela");
  });
});

test.describe('the sheet on a phone', () => {
  test.use({houseOpts: {cfg: ASK_CFG, aiTask: AI_TASK, time: AFTERNOON}});

  test('covers the screen, with the field at the top of it, in dynamic viewport units', async ({house}) => {
    test.skip(!isPhone(house), 'the phone covers the screen');
    await withAsk(house);
    await openAsk(house);
    const [field, body] = await Promise.all([
      askField(house).boundingBox(),
      askSheet(house).locator('.body').boundingBox(),
    ]);
    const height = house.page.viewportSize()!.height;
    expect(field!.y).toBeLessThan(height / 3);
    expect(body!.height).toBeGreaterThan(height * 0.6);
  });
});

// The ways a question fails (spec 29, "The model of the sheet"; #539): each has its own plain line, and a slow question can be stopped. The harness holds the model's reply
// back by `delayMs` on the page's clock, which Playwright's `clock` runs, so thirty seconds take no real time.
const TIMEOUT_EN = 'That took too long. Try again or ask something simpler.';
const UNAVAILABLE_EN = "The house's model isn't answering right now.";
const retryButton = (house: Parameters<typeof askMessage>[0]) => askSheet(house).locator('#ask-retry');
const cancelButton = (house: Parameters<typeof askMessage>[0]) => askSheet(house).locator('#ask-cancel');

test.describe('a slow model', () => {
  // a reply that takes twenty seconds is slow and still in time; the timeout test holds it back for two minutes
  test.use({houseOpts: {cfg: ASK_CFG, aiTask: {...AI_TASK, delayMs: 20_000}, time: AFTERNOON}});

  test('says what it is doing, and Cancel returns to the field with the question kept and focus on it', async ({
    house,
  }) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await expect(askMessage(house)).toHaveText('Working out what you asked…');
    await expect(cancelButton(house)).toHaveText('Cancel');
    await cancelButton(house).click();
    await expect(askMessage(house)).toHaveCount(0);
    await expect(cancelButton(house)).toHaveCount(0);
    await expect(askField(house)).toHaveValue(QUESTION);
    await expect(askField(house)).toBeFocused();
    // the reply that comes later is dropped, and the model's thirty seconds are over with the cancel
    await house.clock.runFor(150_000);
    await expect(askMessage(house)).toHaveCount(0);
    await expect(askSheet(house).locator('hp-ask-answer')).toHaveCount(0);
    expect(await house.generated()).toHaveLength(1);
  });

  test('a cancelled question can be asked again, and its answer is the one shown', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await cancelButton(house).click();
    await askField(house).press('Enter');
    await expect(askMessage(house)).toHaveText('Working out what you asked…');
    await house.clock.runFor(20_001);
    await expect(askSheet(house).locator('#ask-summary')).toHaveText(/^Office · last 24 hours/);
    expect(await house.generated()).toHaveLength(2);
  });

  test('a second question typed while one is in flight replaces it: the first reply is dropped', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION_YESTERDAY);
    await expect.poll(async () => (await house.generated()).length).toBe(1);
    await sendQuestion(house, QUESTION);
    await expect.poll(async () => (await house.generated()).length).toBe(2);
    await house.clock.runFor(20_001);
    await expect(askSheet(house).locator('#ask-summary')).toHaveText(/^Office · last 24 hours/);
    await expect(askSheet(house).locator('#ask-understood')).not.toContainText('yesterday');
  });

  test('gives up after thirty seconds, says so and offers to try again', async ({house}) => {
    await aiTaskNow(house, {delayMs: 120_000});
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await expect(askMessage(house)).toHaveText('Working out what you asked…');
    await house.clock.runFor(29_000);
    await expect(askMessage(house)).toHaveText('Working out what you asked…');
    await house.clock.runFor(1_001);
    await expect(askMessage(house)).toHaveText(TIMEOUT_EN);
    await expect(cancelButton(house)).toHaveCount(0);
    await expect(askField(house)).toHaveValue(QUESTION);
    // Try again sends the same question once more; this time the model answers at once
    await aiTaskNow(house, {delayMs: 0});
    await retryButton(house).click();
    await expect(askSheet(house).locator('#ask-summary')).toHaveText(/^Office · last 24 hours/);
    const calls = await house.generated();
    expect(calls).toHaveLength(2);
    expect(calls[1].data.instructions).toBe(calls[0].data.instructions);
  });

  test('the progress row keeps its dot still under reduced motion, and breathes otherwise', async ({house}) => {
    const dot = (h: typeof house) => askMessage(h).evaluate(el => getComputedStyle(el, '::before').animationName);
    // the project's browsers are set to reduce motion; this one test asks for the motion first
    await house.page.emulateMedia({reducedMotion: 'no-preference'});
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await expect(askMessage(house)).toBeVisible();
    expect(await dot(house)).toBe('askbreath');
    await house.page.emulateMedia({reducedMotion: 'reduce'});
    expect(await dot(house)).toBe('none');
  });
});

test.describe('a model that does not answer', () => {
  test.use({houseOpts: {cfg: ASK_CFG, aiTask: {...AI_TASK, fail: true}, time: AFTERNOON}});

  test('is said so, with Try again, which asks the same question and is answered once the model is back', async ({
    house,
  }) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await expect(askMessage(house)).toHaveText(UNAVAILABLE_EN);
    await expect(askField(house)).toHaveValue(QUESTION);
    // the cause is logged to the console for the one who looks (the loader's), and is the only error this test expects
    expect(house.errors).toEqual(['home-panel ask {code: unknown_error, message: the AI Task failed on purpose}']);
    house.errors.length = 0;
    await aiTaskNow(house, {fail: false});
    await retryButton(house).click();
    await expect(askSheet(house).locator('#ask-summary')).toBeVisible();
    expect(await house.generated()).toHaveLength(2);
  });
});

test.describe('an AI Task entity that is unavailable', () => {
  test.use({houseOpts: {cfg: ASK_CFG, aiTask: AI_TASK, time: AFTERNOON}});

  test('is said so at once, without a call to it', async ({house}) => {
    await withAsk(house);
    await house.setState(ASK_ENTITY, {state: 'unavailable'});
    await openAsk(house);
    await sendQuestion(house, QUESTION);
    await expect(askMessage(house)).toHaveText(UNAVAILABLE_EN);
    await expect(retryButton(house)).toBeVisible();
    expect(await house.generated()).toHaveLength(0);
  });
});

test.describe('a period the recorder has nothing for', () => {
  test.use({houseOpts: {cfg: ASK_CFG, aiTask: AI_TASK, time: AFTERNOON}});

  test('names the sensor and the period, and offers no retry (it would answer the same)', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await house.page.evaluate(() => window.house.emptyStatistics(true));
    await sendQuestion(house, QUESTION_YESTERDAY);
    await expect(askMessage(house)).toHaveText('No history for Office yesterday.');
    await expect(askSheet(house).locator('hp-ask-answer')).toHaveCount(0);
    await expect(retryButton(house)).toHaveCount(0);
  });
});

test.describe('the failures in French', () => {
  test.use({
    houseOpts: {
      cfg: {...ASK_CFG, names: KEEP_ENGLISH_NAMES},
      lang: 'fr',
      aiTask: {...AI_TASK, delayMs: 120_000},
      time: AFTERNOON,
    },
  });

  test('the progress row, the timeout and the way to try again are said in French', async ({house}) => {
    await withAsk(house);
    await openAsk(house);
    await sendQuestion(house, QUESTION_FR);
    await expect(cancelButton(house)).toHaveText('Annuler');
    await house.clock.runFor(30_001);
    await expect(askMessage(house)).toHaveText(
      'Cela a pris trop de temps. Réessayez ou posez une question plus simple.',
    );
    await expect(retryButton(house)).toHaveText('Réessayer');
  });
});
