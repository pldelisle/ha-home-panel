// The Today line's layout: one dot alone, runs close together grouped with their count and range, the clamps that keep
// groups a gap apart and inside the line, the two label rows, the classes and what a screen reader says.
// Pattern: example tests at a pure layout function (ADR 0005), as the dial's and the gauge's geometry are tested.
// Must not: read the clock or the DOM (the width is a number), or hold a real name.
import {describe, expect, test} from 'vitest';
import type {TraceSummary} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {dotClass, timelineLayout, type TimelineDot} from '../../../../src/features/automations/timeline-layout.ts';

const deps = {t: createMessages({language: 'en', tag: 'en-CA'}).t, fmt: createFormatters(englishLocale('UTC'))};
const NOW = Date.parse('2026-11-07T12:00:00Z');
const at = (h: number, m = 0) => `2026-11-07T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
const ran = (h: number, m = 0, more: Partial<TraceSummary> = {}, name = 'Group - lights'): TimelineDot => ({
  summary: {item_id: 'a', run_id: `r${h}${m}`, timestamp: {start: at(h, m)}, state: 'stopped', ...more},
  mins: h * 60 + m,
  item: 'a',
  name,
});
const up = (h: number): TimelineDot => ({up: true, t: Date.parse(at(h)), mins: h * 60, item: 'b', name: 'Heating'});

test('dotClass: still to come, running, stopped by a check, failed, ran', () => {
  expect(
    [
      up(13),
      ran(1, 0, {state: 'running'}),
      ran(1, 0, {script_execution: 'failed_conditions'}),
      ran(1, 0, {script_execution: 'error'}),
      ran(1),
    ].map(dotClass),
  ).toEqual(['up', 'now', 'skip', 'err', '']);
});

describe('timelineLayout', () => {
  test('in French the times are 24-hour, as the panel writes them elsewhere', () => {
    const fr = {
      t: createMessages({language: 'fr', tag: 'fr-CA'}).t,
      fmt: createFormatters({
        ...englishLocale('UTC'),
        language: 'fr',
        tag: 'fr-CA',
        hour12: undefined,
        numberLocale: 'fr-CA',
      }),
    };
    const [one] = timelineLayout([ran(18, 5)], 800, NOW, fr).groups;
    expect(one.label).toBe('18 h 05');
    const [group] = timelineLayout([ran(6), ran(6, 10)], 800, NOW, fr).groups;
    expect(group.label).toBe('6 h–6 h 10');
  });

  test('one run alone: at its time, on the first row, said with its time, name and what it did; the now line', () => {
    const layout = timelineLayout([ran(6)], 800, NOW, deps);
    expect(layout.nowPct).toBe(50);
    expect(layout.groups).toEqual([
      {x: 25, dots: [ran(6)], cls: '', row: 0, label: '6:00 am', description: '6:00 am Group - lights, ran'},
    ]);
  });

  test('runs closer than half a gap share a dot in the middle, with their range and each said in short', () => {
    const dots = [ran(6), ran(6, 10, {script_execution: 'failed_conditions'})];
    const [g] = timelineLayout(dots, 800, NOW, deps).groups;
    expect(g.x).toBeCloseTo(((360 + 370) / 2 / 1440) * 100);
    expect(g).toMatchObject({
      cls: '',
      label: '6:00 am–6:10 am',
      description: '6:00 am to 6:10 am · 2 runs · lights, ran · lights, checked, did nothing',
    });
  });

  test('a group class: running wins, then an error, then all skipped or all to come', () => {
    const cls = (dots: TimelineDot[]) => timelineLayout(dots, 800, NOW, deps).groups[0].cls;
    expect(cls([ran(6), ran(6, 1, {state: 'running'}), ran(6, 2, {script_execution: 'error'})])).toBe('now');
    expect(cls([ran(6), ran(6, 1, {script_execution: 'error'})])).toBe('err');
    expect(cls([ran(6, 0, {script_execution: 'failed_conditions'})])).toBe('skip');
    expect(cls([up(20), up(20)])).toBe('up');
  });

  test('groups keep a gap apart and inside the line; a narrow line widens the gap; labels take two rows, then none', () => {
    // at 240 px the gap is 12.5 percent: the 23:50 run, a gap after the 21:30 one, would leave the line, so it is put
    // back at its end and the 21:30 one a gap before it
    const groups = timelineLayout([ran(21, 30), ran(23, 50)], 240, NOW, deps).groups;
    expect(groups.map(g => +g.x.toFixed(2))).toEqual([87.5, 100]);
    // three runs a gap apart (2.2 percent at this width): the third finds both rows taken and goes without a label
    const tight = timelineLayout([ran(6), ran(6, 20), ran(6, 40)], 2000, NOW, deps).groups;
    expect(tight.map(g => g.row)).toEqual([0, 1, -1]);
  });
});
