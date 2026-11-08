// pickStack() and the reminder window: which card the idle clock's smart stack shows
import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileFunction} from 'node:vm';
// stack.js is a plain script too; compileFunction takes the file's name so V8 coverage is attributed to src/stack.js (#34 turns this into an import)
const stackUrl = new URL('../../src/stack.js', import.meta.url);
const {pickStack, inHours, reminderLeft, STACK_TURN_MS} = compileFunction(
  readFileSync(stackUrl, 'utf8') + '\nreturn {pickStack, inHours, reminderLeft, STACK_TURN_MS};',
  [],
  {filename: fileURLToPath(stackUrl)},
)();
const card = (k, tone = null, filler = false) => ({k, tone, filler});

test('nothing applies: no card', () => {
  expect(pickStack([], 0)).toBe(null);
  expect(pickStack(undefined, 0)).toBe(null);
});
test('cards take turns, one per tick', () => {
  const C = [card('tomorrow'), card('car'), card('who')];
  expect([0, 1, 2, 3].map(i => pickStack(C, i * STACK_TURN_MS).card.k)).toStrictEqual([
    'tomorrow',
    'car',
    'who',
    'tomorrow',
  ]);
  expect(pickStack(C, 0).n).toBe(3);
});
test('a red alert pins itself; the rest wait', () => {
  const C = [card('tomorrow'), card('door', 'red'), card('wxwarn', 'amber')];
  for (let i = 0; i < 4; i++) expect(pickStack(C, i * STACK_TURN_MS).card.k).toBe('door');
  expect(pickStack(C, 0).n).toBe(1);
});
test('amber cards come first in the rotation', () => {
  const C = [card('tomorrow'), card('car'), card('carlow', 'amber')];
  expect(pickStack(C, 0).card.k).toBe('carlow');
});
test('fillers only when nothing else applies', () => {
  expect(pickStack([card('energy', null, true), card('car')], 0).n).toBe(1);
  expect(pickStack([card('energy', null, true), card('car')], STACK_TURN_MS).card.k).toBe('car');
  expect(pickStack([card('energy', null, true)], 0).card.k).toBe('energy');
});
test('hour windows cross midnight', () => {
  expect(inHours(23, 21, 7)).toBeTruthy();
  expect(inHours(3, 21, 7)).toBeTruthy();
  expect(!inHours(12, 21, 7)).toBeTruthy();
  expect(inHours(17.5, 17, 24)).toBeTruthy();
  expect(!inHours(16.9, 17, 24)).toBeTruthy();
});
test('a reminder shows for its lead time before its hour', () => {
  expect(reminderLeft({at: '20:00', lead: 30}, 19.5)).toBe(30);
  expect(reminderLeft({at: '20:00', lead: 30}, 19.75)).toBe(15);
  expect(reminderLeft({at: '20:00', lead: 30}, 19.4)).toBe(null);
  expect(reminderLeft({at: '20:00', lead: 30}, 20)).toBe(null);
  expect(reminderLeft({at: '00:10'}, 23.95)).toBe(13);
  expect(reminderLeft({at: 'nope'}, 12)).toBe(null);
});
