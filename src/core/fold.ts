// fold: a name in the form two names are compared in, so case and accents never decide a match (`Lumière` is `lumiere`).
// Pattern: a pure function over a value (functional core), Unicode's canonical decomposition (NFD) with the combining marks dropped, as the
// Unicode Standard's annex 15 describes; the legacy panel's own `fold` is the same rule and goes with its last reader (who's home, #264).
// Must not: trim, split or collapse spaces (the callers' word rules do), or be used to show a name: it is for comparing only.

/** `text` in lower case with its accents dropped. */
export const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
