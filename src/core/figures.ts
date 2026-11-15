// Figures the panel writes the same way everywhere: the dash for a missing reading, a capital letter, a name said as a phrase, and the length of a minute, an hour and a day.
// Pattern: shared kernel (Evans, Domain-Driven Design): a few constants and two pure functions every feature may import,
// so a feature never imports another feature's helpers (ADR 0011). `whole`, `degrees` and `fixedOr` sit beside `fmt.integer`, in format.ts.
// Must not: read the clock or a locale, or grow into a utility drawer: a name arrives here with its second feature.

/** What a missing figure shows. */
export const DASH = '–';

export const MINUTE_MS = 6e4;
export const HOUR_MS = 36e5;
export const DAY_MS = 864e5;

/** The text with its first letter in capitals. */
export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** A name Home Assistant gives (`fan_only`, `very_high`) said as a phrase: the underscores spaces, the first letter a capital; the legacy `cap()`. Air and Climate say one this way. */
export const capitalWords = (name: string): string => capitalise(name.replace(/_/g, ' '));
