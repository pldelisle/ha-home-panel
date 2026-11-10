// The element view of a kit stylesheet: the legacy frame selectors (`.app.cp`, `.app.gl`) become host selectors.
// Pattern: one source, two views (ADR 0019): a rule is written once, in the frame's terms, and an element adopts the
// same text with the frame's state read from its own host attributes, which `AppearanceConsumer` reflects (Lit docs, Styles: `:host()`).
// Must not: change any other part of a rule, know a rule by name, or run anywhere but where a stylesheet is adopted.

// The frame's state as the legacy sheet spells it, and as a host attribute. `tabsv` is on `.app` in every tab view, so it says nothing.
const STATE: Readonly<Record<string, string>> = {
  tabsv: '',
  cp: '[compact]',
  gl: '[glass]',
  narrow: '[narrow]',
  txl: '[large-text]',
};

// `.app` and what is chained on it before the next space, combinator or comma: classes, attribute tests, `:not(...)`
const FRAME = /(?<![\w-])\.app((?:\.[\w-]+|\[[^\]]*\]|:not\([^)]*\))*)(?![\w-])/g;
const PART = /\.([\w-]+)|(\[[^\]]*\])|:not\(([^)]*)\)/g;

const state = (cls: string): string => {
  const mapped = STATE[cls];
  if (mapped === undefined) throw new Error(`a kit rule names the frame state .${cls}, which has no host attribute`);
  return mapped;
};

// the inside of one `:not(...)`: a state class, or an attribute test
const negate = (inner: string): string => {
  const cls = /^\.([\w-]+)$/.exec(inner)?.[1];
  return `:not(${cls ? state(cls) : inner})`;
};

/** `.app.gl .sheet` is `:host([glass]) .sheet`, `.app:not(.cp) .x` is `:host(:not([compact])) .x`, a bare `.app .x` is `:host .x`. */
export function forShadow(css: string): string {
  return css.replace(FRAME, (_all, chain: string) => {
    const tests = chain.replace(PART, (_part, cls?: string, attr?: string, not?: string) =>
      cls !== undefined ? state(cls) : attr !== undefined ? attr : negate(not as string),
    );
    return tests ? `:host(${tests})` : ':host';
  });
}
