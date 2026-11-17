// The Today card's line as geometry: one dot per run, or per runs closer together than a dot is wide, on a 24-hour axis,
// each with its class, its time label on one of two rows and the sentence a screen reader says.
// Pattern: a pure layout function (Bernhardt, functional core) the way the dial's and the gauge's geometry are, the rules
// of the legacy `renderAuto()`'s timeline: the grouping by proximity, the clamps that keep the dots apart and inside the line.
// Must not: read the clock (`now` is passed in) or the DOM (the width in pixels is passed in), or draw.
import type {TraceSummary} from '../../core/ha.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {minutesOfDay} from '../../providers/automations.ts';
import {shortAlias} from './sentences.ts';

/** A run of today, or (`up`) a run still to come: its local minutes since midnight, its automation and that one's name. */
export type TimelineDot = RunDot | UpDot;
export interface RunDot {
  up?: false;
  summary: TraceSummary;
  mins: number;
  item: string;
  name: string;
}
export interface UpDot {
  up: true;
  t: number;
  mins: number;
  item: string;
  name: string;
}

/** The dot is a run still to come. */
export const isUp = (dot: TimelineDot): dot is UpDot => dot.up === true;

/** A dot's class: still to come, running, stopped by a check, failed, or ran. */
export type DotClass = 'up' | 'now' | 'skip' | 'err' | '';

export interface TimelineGroup {
  /** Its place on the line, in percent. */
  x: number;
  dots: TimelineDot[];
  cls: DotClass;
  /** The label row it takes, 0 or 1; -1 when both rows are taken there and it goes without a label. */
  row: -1 | 0 | 1;
  /** `07:02`, or `07:02–07:05` for several. */
  label: string;
  /** What a screen reader says of it. */
  description: string;
}

export interface TimelineLayout {
  groups: TimelineGroup[];
  /** The now line, in percent. */
  nowPct: number;
}

/** The class of one dot. */
export function dotClass(dot: TimelineDot): DotClass {
  if (isUp(dot)) return 'up';
  const s = dot.summary;
  return s.state === 'running'
    ? 'now'
    : s.script_execution === 'failed_conditions'
      ? 'skip'
      : s.script_execution === 'error'
        ? 'err'
        : '';
}

/** A group's class: running wins, then an error; every dot skipped or still to come says so; else it ran. */
function groupClass(classes: DotClass[]): DotClass {
  if (classes.includes('now')) return 'now';
  if (classes.includes('err')) return 'err';
  if (classes.every(c => c === 'skip')) return 'skip';
  if (classes.every(c => c === 'up')) return 'up';
  return '';
}

const WHAT: Record<DotClass, string> = {up: 'scheduled', skip: 'skip', now: 'now', err: 'err', '': 'ran'};

/**
 * The line's layout for `dots` sorted by time, on a line `widthPx` wide: dots closer than about half a dot's gap share a
 * group, each group at least a gap from the last and the line's end, and the labels on two rows, a group taking the first
 * row with room for its label.
 */
export function timelineLayout(
  dots: TimelineDot[],
  widthPx: number,
  now: number,
  deps: {t: Translate; fmt: Formatters},
): TimelineLayout {
  const gapPct = Math.max(2.2, 3000 / Math.max(widthPx, 240));
  const raw: {pct: number; last: number; dots: TimelineDot[]}[] = [];
  for (const d of dots) {
    const g = raw[raw.length - 1],
      pct = (d.mins / 1440) * 100;
    if (g && pct - g.last < gapPct * 0.55) {
      g.dots.push(d);
      g.last = pct;
    } else raw.push({pct, last: pct, dots: [d]});
  }
  const xs = raw.map(g => (g.dots.length > 1 ? (g.pct + g.last) / 2 : g.pct));
  for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + gapPct);
  for (let i = xs.length - 1, r = 100 + gapPct; i >= 0; i--) {
    xs[i] = Math.min(xs[i], r - gapPct);
    r = xs[i];
  }
  const timeOf = (d: TimelineDot) => deps.fmt.time(new Date(isUp(d) ? d.t : d.summary.timestamp.start));
  const what = (c: DotClass) => deps.t('automations.timeline.what', {what: WHAT[c]});
  const rowEnd = [-99, -99];
  const groups = raw.map((g, i): TimelineGroup => {
    const x = xs[i],
      n = g.dots.length,
      cls = groupClass(g.dots.map(dotClass)),
      from = timeOf(g.dots[0]),
      to = timeOf(g.dots[n - 1]),
      need = n > 1 ? 7.5 : 4.5;
    const row = rowEnd[0] < x - need ? 0 : rowEnd[1] < x - need ? 1 : -1;
    if (row >= 0) rowEnd[row] = x;
    const description =
      n > 1
        ? deps.t('automations.timeline.group', {
            from,
            to,
            n,
            // one piece per run, read with the house's separator, as the legacy line was
            items: g.dots
              .map(d => deps.t('automations.timeline.item', {name: shortAlias(d.name), what: what(dotClass(d))}))
              .join(' · '),
          })
        : deps.t('automations.timeline.one', {time: from, name: g.dots[0].name, what: what(cls)});
    return {x, dots: g.dots, cls, row, label: n > 1 ? `${from}–${to}` : from, description};
  });
  return {groups, nowPct: (minutesOfDay(now, deps.fmt) / 1440) * 100};
}
