// pickStack() and the reminder window: which card the idle clock's smart stack shows
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {pickStack, inHours, reminderLeft, STACK_TURN_MS} = new Function(readFileSync(new URL('../../src/stack.js', import.meta.url), 'utf8') + '\nreturn {pickStack, inHours, reminderLeft, STACK_TURN_MS};')();
const card = (k, tone = null, filler = false) => ({k, tone, filler});

test('nothing applies: no card', () => {
  assert.equal(pickStack([], 0), null);
  assert.equal(pickStack(undefined, 0), null);
});
test('cards take turns, one per tick', () => {
  const C = [card('tomorrow'), card('car'), card('who')];
  assert.deepEqual([0, 1, 2, 3].map(i => pickStack(C, i * STACK_TURN_MS).card.k), ['tomorrow', 'car', 'who', 'tomorrow']);
  assert.equal(pickStack(C, 0).n, 3);
});
test('a red alert pins itself; the rest wait', () => {
  const C = [card('tomorrow'), card('door', 'red'), card('wxwarn', 'amber')];
  for (let i = 0; i < 4; i++) assert.equal(pickStack(C, i * STACK_TURN_MS).card.k, 'door');
  assert.equal(pickStack(C, 0).n, 1);
});
test('amber cards come first in the rotation', () => {
  const C = [card('tomorrow'), card('car'), card('carlow', 'amber')];
  assert.equal(pickStack(C, 0).card.k, 'carlow');
});
test('fillers only when nothing else applies', () => {
  assert.equal(pickStack([card('energy', null, true), card('car')], 0).n, 1);
  assert.equal(pickStack([card('energy', null, true), card('car')], STACK_TURN_MS).card.k, 'car');
  assert.equal(pickStack([card('energy', null, true)], 0).card.k, 'energy');
});
test('hour windows cross midnight', () => {
  assert.ok(inHours(23, 21, 7)); assert.ok(inHours(3, 21, 7)); assert.ok(!inHours(12, 21, 7));
  assert.ok(inHours(17.5, 17, 24)); assert.ok(!inHours(16.9, 17, 24));
});
test('a reminder shows for its lead time before its hour', () => {
  assert.equal(reminderLeft({at: '20:00', lead: 30}, 19.5), 30);
  assert.equal(reminderLeft({at: '20:00', lead: 30}, 19.75), 15);
  assert.equal(reminderLeft({at: '20:00', lead: 30}, 19.4), null);
  assert.equal(reminderLeft({at: '20:00', lead: 30}, 20), null);
  assert.equal(reminderLeft({at: '00:10'}, 23.95), 13);
  assert.equal(reminderLeft({at: 'nope'}, 12), null);
});
