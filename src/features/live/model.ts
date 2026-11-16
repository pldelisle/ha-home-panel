// liveModel: the header's pill and its popup as a view model, from the activities, the checks and the pill's remembered state.
// Pattern: Presentation Model (Fowler): one pure function the elements (#256) draw without a rule of their own; the five pill cases are the
// legacy `laPill()`'s (empty, a problem alone, an activity, a finished one, an activity with a problem's bubble), the popup the legacy `renderAttention()`'s.
// Must not: read the clock or the states, keep state (the next `LiveState` is returned for the element to keep), or draw.
import type {Formatters} from '../../core/i18n/format.ts';
import {
  carActivity,
  hiloActivity,
  sortActivities,
  waterActivity,
  type Activity,
  type ActivityCardView,
  type LiveHistoryData,
  type PillText,
} from './activities.ts';
import {runChecks, type CheckDeps, type CheckItem} from './checks.ts';
import {nextDone, type LiveState} from './done.ts';
import type {LiveInputs} from './inputs.ts';

export interface LiveModelDeps extends CheckDeps {
  fmt: Formatters;
  /** A phone: the pill says the long text, and a finished activity's check has no time. */
  compact: boolean;
}

/** An activity's ring: what it shows and how far along. */
export interface RingView {
  icon: Activity['icon'];
  color: string;
  progress: number | null;
}

/** The problem's bubble or pill: red when a check is critical, else amber. */
export interface AttentionView {
  level: 'crit' | 'warn';
  /** `2 things need attention`. */
  text: string;
}

export type PillView =
  | ({kind: 'attention'} & AttentionView)
  | {
      kind: 'activity';
      ring: RingView;
      tint: boolean;
      text: PillText;
      aria: string;
      bubbles: (RingView & {aria: string})[];
      attention: AttentionView | null;
    }
  | {kind: 'done'; text: string; time: string | null; attention: AttentionView | null};

export interface LiveViewModel {
  /** Null: nothing runs, nothing finished and nothing needs attention, so the spot stays empty (2.8.0). */
  pill: PillView | null;
  popup: {
    activities: (ActivityCardView & {key: Activity['key']; ring: RingView})[];
    status: {label: string; right: string; items: CheckItem[]; clear: string[]; empty: string | null};
  };
  /** What the element keeps for the next reading. */
  state: LiveState;
  /** How many activities run: the shell tells the weather chip to slim down when any does. */
  activityCount: number;
}

const ringOf = ({icon, color, progress}: Activity): RingView => ({icon, color, progress});

/** The pill and the popup at this reading, and the state to keep. */
export function liveModel(
  inputs: LiveInputs,
  history: LiveHistoryData | null,
  state: LiveState,
  deps: LiveModelDeps,
): LiveViewModel {
  const {t, fmt, compact} = deps;
  const activities = sortActivities([
    hiloActivity(inputs, deps),
    carActivity(inputs, history, deps),
    waterActivity(inputs, history, deps),
  ]);
  const next = nextDone(state, activities, inputs);
  const {items, clear} = runChecks(inputs, deps);
  const attention: AttentionView | null = items.length
    ? {
        level: items.some(item => item.level === 'crit') ? 'crit' : 'warn',
        text: t('live.needsAttention', {n: items.length}),
      }
    : null;
  const [first, ...others] = activities;
  const {done} = next;
  const pill: PillView | null = first
    ? {
        kind: 'activity',
        ring: ringOf(first),
        tint: first.tint,
        text: compact ? first.pill : first.short,
        aria: first.ariaLabel,
        bubbles: others.map(activity => ({...ringOf(activity), aria: activity.ariaLabel})),
        attention,
      }
    : done
      ? {
          kind: 'done',
          text: done.kind === 'charged' ? t('live.chargedTo', {n: done.soc}) : t('live.challengeDone'),
          time: compact ? null : fmt.time(done.at),
          attention,
        }
      : attention && {kind: 'attention', ...attention};
  return {
    pill,
    popup: {
      activities: activities.map(activity => ({...activity.card, key: activity.key, ring: ringOf(activity)})),
      status: {
        label: t('live.status'),
        right: items.length ? t('live.itemsNeedAttention', {n: items.length}) : t('live.allClear'),
        items,
        clear,
        empty: items.length ? null : t('live.reportingNormally'),
      },
    },
    state: next,
    activityCount: activities.length,
  };
}
