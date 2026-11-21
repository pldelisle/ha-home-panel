// The question set of the recorded-model suite: each `expected` is a plan the parser accepts for the full test house's catalog, the ids are
// unique, and the set covers what spec 29 asks of it (both languages, the three forms, the nine periods, both kinds of test, a minimum length, the unsupported ones).
// Pattern: a test of data (Meszaros, xUnit Test Patterns): the fixture is checked against the code it will be judged by, so it cannot drift from it.
// Must not: call a model, or name a real place or person (the personal-data scan covers the file).
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {ASK_NOW, askHouse, catalogOf} from '../../../../scripts/lib/ask-house.mjs';
import {wireOf, type Question} from '../../../../scripts/lib/ask-suite.mjs';
import {PERIODS} from '../../../../src/features/ask/period.ts';
import {askInstructions} from '../../../../src/features/ask/instructions.ts';
import {parsePlan} from '../../../../src/features/ask/plan.ts';

const QUESTIONS = JSON.parse(
  readFileSync(new URL('../../fixtures/ask/questions.json', import.meta.url), 'utf8'),
) as Question[];

/** A question as the instructions' examples are written: lower case, and no space left over. */
const normal = (text: string) => text.trim().toLowerCase();

describe('questions.json', () => {
  test('no question is one of the worked examples in the instructions', () => {
    const {catalog, fmt} = askHouse('en');
    const text = askInstructions('x', new Date(ASK_NOW), catalog, 'en', fmt);
    const examples = [...text.matchAll(/"([^"]+)"/g)].map(([, example]) => normal(example));
    // the examples are in the text, among them the ones this suite once repeated
    expect(examples).toContain('how warm was the office yesterday?');
    expect(examples).toContain('how much did the car charge last week?');
    for (const question of QUESTIONS) expect(examples).not.toContain(normal(question.question));
  });

  test('is about forty questions with unique ids and unique texts, half in each language', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(36);
    expect(new Set(QUESTIONS.map(question => question.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map(question => question.question)).size).toBe(QUESTIONS.length);
    const french = QUESTIONS.filter(question => question.language === 'fr');
    expect(new Set(QUESTIONS.map(question => question.language))).toEqual(new Set(['en', 'fr']));
    expect(french.length).toBe(QUESTIONS.length - french.length);
  });

  test.each(QUESTIONS.map(question => [question.id, question] as const))(
    '%s: the expected plan is one the parser accepts for the full house, as the wire says it',
    (_id, question) => {
      expect(parsePlan(wireOf(question.expected), catalogOf(question.language))).toEqual(question.expected);
    },
  );

  test('covers the three forms, the nine periods, both kinds of test, a minimum length and at least six unsupported', () => {
    const plans = QUESTIONS.map(question => question.expected);
    expect(new Set(plans.map(plan => plan.form))).toEqual(new Set(['series', 'moments', 'total', 'unsupported']));
    expect(plans.filter(plan => plan.form === 'unsupported').length).toBeGreaterThanOrEqual(6);
    const asked = plans.filter(plan => plan.form !== 'unsupported');
    expect(new Set(asked.map(plan => 'period' in plan && plan.period))).toEqual(new Set(PERIODS));
    const tests = plans.flatMap(plan => (plan.form === 'moments' ? [Object.keys(plan.test)[0]] : []));
    expect(new Set(tests)).toEqual(new Set(['on', 'above', 'below']));
    expect(plans.some(plan => plan.form === 'moments' && 'on' in plan.test && !plan.test.on)).toBe(true);
    expect(plans.some(plan => plan.form === 'moments' && plan.longerThanMin !== null)).toBe(true);
  });

  test('asks about every kind of sensor the full house offers, in both languages', () => {
    const wanted = new Set(
      QUESTIONS.flatMap(question => ('sensor' in question.expected ? [question.expected.sensor] : [])),
    );
    const heldBy = (language: string) =>
      new Set(
        QUESTIONS.filter(question => question.language === language).flatMap(question =>
          'sensor' in question.expected ? [question.expected.sensor.split('.')[0]] : [],
        ),
      );
    for (const handle of [
      'door.living_room',
      'motion.office',
      'home.alex',
      'home.sam',
      'energy.house',
      'energy.water_heater',
      'energy.car',
      'energy.heating',
    ])
      expect(wanted).toContain(handle);
    expect(heldBy('en')).toEqual(heldBy('fr'));
  });
});
