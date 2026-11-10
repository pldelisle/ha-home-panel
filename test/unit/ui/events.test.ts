// The events an element sends up (src/ui/events.ts): they must cross shadow roots, and carry what the shell reads.
import {expect, test} from 'vitest';
import {SheetDismissEvent, SheetRequestEvent, ToastEvent} from '../../../src/ui/events.ts';

test('a sheet request bubbles and is composed, and carries the id and the detail', () => {
  const e = new SheetRequestEvent('weather.history', {key: 'wind'});
  expect(e.type).toBe('sheet-request');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({id: 'weather.history', detail: {key: 'wind'}});
  expect(new SheetRequestEvent('sh-energy').detail).toEqual({id: 'sh-energy', detail: undefined});
});

test('a dismissal bubbles and is composed, and carries the id of the sheet to close', () => {
  const e = new SheetDismissEvent('weather.detail');
  expect(e.type).toBe('sheet-dismiss');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({id: 'weather.detail'});
});

test('a toast bubbles and is composed, and is not sticky unless it says so', () => {
  const e = new ToastEvent('Saved');
  expect(e.type).toBe('toast');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({message: 'Saved', sticky: false});
  expect(new ToastEvent('No', true).detail.sticky).toBe(true);
});
