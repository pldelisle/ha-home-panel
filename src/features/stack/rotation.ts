// The smart stack's rotation: which card shows at an instant, and the two clock rules the cards' windows use.
// Pattern: pure functions over plain data (functional core), a typed copy of `src/stack.js`; the legacy panel may not import a feature,
// so `src/stack.js` and `test/unit/stack.test.mjs` stay for the legacy stack until #266 deletes all three of them together.
// Must not: read the clock (`now` and the hour are passed in), the states or the DOM, or reorder cards of the same tone.
import type {Reminder} from '../../core/config.ts';

/** One card per twenty seconds. */
export const STACK_TURN_MS = 20_000;

/** What the rotation reads of a card. */
export interface Turnable {
  tone: 'red' | 'amber' | null;
  filler: boolean;
}

const TONE_RANK: Record<string, number> = {red: 0, amber: 1};
const rank = (tone: Turnable['tone']): number => (tone === null ? 2 : TONE_RANK[tone]);

/**
 * The card for this tick, its place and how many take turns: a red card pins itself (the reds take turns alone), amber cards
 * come first, fillers only when nothing else applies; null when no card applies.
 */
export function pickStack<C extends Turnable>(
  cards: readonly C[],
  now: number,
): {card: C; i: number; n: number} | null {
  const red = cards.filter(c => c.tone === 'red');
  let pool = red.length ? red : cards.filter(c => !c.filler);
  if (!pool.length) pool = cards.filter(c => c.filler);
  if (!pool.length) return null;
  // a stable order: amber first, then the order the cards were listed in
  pool = pool
    .map((c, i) => [c, i] as const)
    .sort((a, b) => rank(a[0].tone) - rank(b[0].tone) || a[1] - b[1])
    .map(([c]) => c);
  const i = Math.floor(now / STACK_TURN_MS) % pool.length;
  return {card: pool[i], i, n: pool.length};
}

/** `h` (a decimal hour: 20.5 is 8:30 pm) is in the window, which may cross midnight (21 to 7). */
export const inHours = (h: number, from: number, to: number): boolean =>
  from <= to ? h >= from && h < to : h >= from || h < to;

/** "20:00" as 20, "7:30" as 7.5; null for anything else. */
function hhmm(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] + +m[2] / 60 : null;
}

/** The minutes left before a reminder's time while it shows (its `lead`, 1 to 240 minutes, 30 by default); null outside that window. */
export function reminderLeft(reminder: Pick<Reminder, 'at' | 'lead'>, h: number): number | null {
  const at = hhmm(reminder.at);
  if (at === null) return null;
  const lead = Math.max(1, Math.min(240, Number(reminder.lead) || 30)) / 60;
  const left = (((at - h) % 24) + 24) % 24;
  return left > 0 && left <= lead ? Math.round(left * 60) : null;
}
