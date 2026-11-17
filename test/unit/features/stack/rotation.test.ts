// pickStack and the reminder window: which card the smart stack shows. The tests of test/unit/stack.test.mjs, typed, over the copy
// in the feature; #266 deletes the legacy file and its test together.
import {expect, test} from 'vitest';
import {
  inHours,
  pickStack,
  reminderLeft,
  STACK_TURN_MS,
  type Turnable,
} from '../../../../src/features/stack/rotation.ts';

const card = (k: string, tone: Turnable['tone'] = null, filler = false) => ({k, tone, filler});

test('nothing applies: no card', () => {
  expect(pickStack([], 0)).toBe(null);
});
test('cards take turns, one per tick', () => {
  const C = [card('tomorrow'), card('car'), card('who')];
  expect([0, 1, 2, 3].map(i => pickStack(C, i * STACK_TURN_MS)!.card.k)).toStrictEqual([
    'tomorrow',
    'car',
    'who',
    'tomorrow',
  ]);
  expect(pickStack(C, 0)!.n).toBe(3);
});
test('a red alert pins itself; the rest wait', () => {
  const C = [card('tomorrow'), card('door', 'red'), card('wxwarn', 'amber')];
  for (let i = 0; i < 4; i++) expect(pickStack(C, i * STACK_TURN_MS)!.card.k).toBe('door');
  expect(pickStack(C, 0)!.n).toBe(1);
});
test('amber cards come first in the rotation', () => {
  const C = [card('tomorrow'), card('car'), card('carlow', 'amber')];
  expect(pickStack(C, 0)!.card.k).toBe('carlow');
});
test('fillers only when nothing else applies', () => {
  expect(pickStack([card('energy', null, true), card('car')], 0)!.n).toBe(1);
  expect(pickStack([card('energy', null, true), card('car')], STACK_TURN_MS)!.card.k).toBe('car');
  expect(pickStack([card('energy', null, true)], 0)!.card.k).toBe('energy');
});
test('hour windows cross midnight', () => {
  expect(inHours(23, 21, 7)).toBe(true);
  expect(inHours(3, 21, 7)).toBe(true);
  expect(inHours(12, 21, 7)).toBe(false);
  expect(inHours(17.5, 17, 24)).toBe(true);
  expect(inHours(16.9, 17, 24)).toBe(false);
});
test('a reminder shows for its lead time before its hour', () => {
  expect(reminderLeft({at: '20:00', lead: 30}, 19.5)).toBe(30);
  expect(reminderLeft({at: '20:00', lead: 30}, 19.75)).toBe(15);
  expect(reminderLeft({at: '20:00', lead: 30}, 19.4)).toBe(null);
  expect(reminderLeft({at: '20:00', lead: 30}, 20)).toBe(null);
  expect(reminderLeft({at: '00:10', lead: 0}, 23.95)).toBe(13);
  expect(reminderLeft({at: 'nope', lead: 30}, 12)).toBe(null);
  expect(reminderLeft({at: '25:00', lead: 30}, 12)).toBe(null);
});
