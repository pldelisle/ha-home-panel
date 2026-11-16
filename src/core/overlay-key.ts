// overlayKey: the key a held (optimistic) value is stored under, one kind of value per suffix.
// Pattern: a key factory, a function of the entity id, so two kinds never share a suffix and a command's `holds` and an element's read agree by construction (ADR 0023).
// Moved down from the kit's overlay store (ADR 0011, shared code moves down) because a provider writes commands as data and names the keys they hold.
// Must not: hold state, read an entity or the clock, or import outside the core.

/** One kind of held value's key, as a function of the entity id: two kinds never share a suffix, so two kinds never share a key. */
export const overlayKey =
  (suffix: string) =>
  (id: string): string =>
    `${id}:${suffix}`;
