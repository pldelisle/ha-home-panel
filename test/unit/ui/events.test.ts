// The events an element sends up (src/ui/events.ts): they must cross shadow roots, and carry what the shell or the guest reads.
import {expect, test} from 'vitest';
import {EmptyEvent, SheetDismissEvent, SheetRequestEvent, TabSelectEvent, ToastEvent} from '../../../src/ui/events.ts';

test('a sheet request bubbles and is composed, and carries the id and the detail', () => {
  const e = new SheetRequestEvent('weather.history', {key: 'wind'});
  expect(e.type).toBe('sheet-request');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({id: 'weather.history', detail: {key: 'wind'}});
  expect(new SheetRequestEvent('sh-car').detail).toEqual({id: 'sh-car', detail: undefined});
});

test('a dismissal bubbles and is composed, and carries the id of the sheet to close', () => {
  const e = new SheetDismissEvent('air.detail');
  expect(e.type).toBe('sheet-dismiss');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({id: 'air.detail'});
});

test('a tab request bubbles and is composed, and carries the key of the section to show', () => {
  const e = new TabSelectEvent('cams');
  expect(e.type).toBe('tab-select');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({key: 'cams'});
  expect(e.detail).not.toHaveProperty('room');
});

test('a tab request may name a room view instead, by its area id', () => {
  const e = new TabSelectEvent({room: 'living_room'});
  expect(e.detail).toEqual({room: 'living_room'});
  expect(e.detail).not.toHaveProperty('key');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
});

test('a toast bubbles and is composed, and is not sticky unless it says so', () => {
  const e = new ToastEvent('Saved');
  expect(e.type).toBe('toast');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({message: 'Saved', sticky: false});
  expect(new ToastEvent('No', true).detail.sticky).toBe(true);
});

test("the Home-card bridge's hp-empty bubbles and is composed, and says whether the element has anything to show", () => {
  const e = new EmptyEvent(true);
  expect(e.type).toBe('hp-empty');
  expect([e.bubbles, e.composed]).toEqual([true, true]);
  expect(e.detail).toEqual({empty: true});
  expect(new EmptyEvent(false).detail.empty).toBe(false);
});
