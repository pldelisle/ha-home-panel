// ClimateDetailEvent: the pane's one event, which must cross the shadow roots to reach the shell, and says what the detail shows or that it left.
import {expect, test} from 'vitest';
import {ClimateDetailEvent} from '../../../../src/features/climate/events.ts';

test('crosses the shadow roots, and carries the room shown, or null when the detail left', () => {
  const shown = new ClimateDetailEvent({sel: 'bedroom'});
  expect([shown.type, shown.bubbles, shown.composed]).toEqual(['climate-detail', true, true]);
  expect(shown.detail).toEqual({shown: {sel: 'bedroom'}});
  expect(new ClimateDetailEvent(null).detail).toEqual({shown: null});
});
