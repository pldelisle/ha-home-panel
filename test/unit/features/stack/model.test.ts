// stackModel: the Home card leaves out the who's-home filler the chips above it already show; the idle screen keeps every card.
import {expect, test} from 'vitest';
import type {StackCard} from '../../../../src/features/stack/cards.ts';
import {stackModel} from '../../../../src/features/stack/model.ts';

const card = (key: string, filler = false): StackCard => ({
  key,
  tone: null,
  filler,
  icon: 'house',
  label: key,
  color: '',
  right: '',
  go: null,
  body: [],
  foot: '',
});

test('the Home mode drops the who’s-home filler, the idle mode keeps it', () => {
  const cards = [card('who', true)];
  expect(stackModel(cards, 0, 'home')).toBeNull();
  expect(stackModel(cards, 0, 'idle')).toEqual({card: cards[0], i: 0, n: 1});
  // the came-or-left card is no filler, and shows in both
  expect(stackModel([card('who')], 0, 'home')!.card.key).toBe('who');
  expect(stackModel([card('energy', true), card('who', true)], 0, 'home')).toEqual({
    card: card('energy', true),
    i: 0,
    n: 1,
  });
});
