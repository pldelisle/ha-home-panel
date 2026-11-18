// isHistoryStale: whether the history behind the charts is old enough for the header's clock to say when it was last updated.
// Pattern: a pure model (Fowler, Presentation Model): the clock line's one decision, kept out of the element so a test reads it without a page.
// The history is asked again every `STATISTICS_TTL_MS` while Home is on screen, so a reply older than that plus a margin is one that did not come.
// Must not: draw, read the clock (`now` is given) or word anything.
import {STATISTICS_TTL_MS} from '../core/statistics-cache.ts';

/** How long past its refresh interval the history may be before the clock says so: a slow reply is not a stale one. */
export const CLOCK_NOTE_MARGIN_MS = 2 * 60_000;

/** True when the cache last answered (`at`, null before its first reply) longer ago than its interval and the margin. */
export function isHistoryStale(at: number | null, now: number): boolean {
  return at !== null && now - at > STATISTICS_TTL_MS + CLOCK_NOTE_MARGIN_MS;
}
