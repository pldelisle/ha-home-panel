// claimDocument: who writes the document's background colour, so two panels on one document do not fight over it.
// Pattern: Registry (Fowler, Patterns of Enterprise Application Architecture): a map from the document to the panels that
// claim it, the most recently connected one owning it. The one place that writes the document's background.
// Must not: read a style or a media query, know what colour means (the controller reads the wallpaper's), or outlive a claim.

/** The slice of a style that the background needs; `CSSStyleDeclaration` fits. */
interface StyleLike {
  setProperty(name: string, value: string, priority?: string): void;
  removeProperty(name: string): string;
}

/** The document: the two elements whose background shows in the overscroll bounce. `document` fits. */
export interface DocumentLike {
  documentElement: {style: StyleLike};
  body: {style: StyleLike};
}

/** What one panel holds of the document's background: it says what colour it wants, and gives it back when it leaves. */
export interface DocumentClaim {
  /** The colour this panel wants behind the document, or null for its own. Written only while this panel owns the background. */
  paint(color: string | null): void;
  /** The panel leaves: the background goes to the previous claimant in its colour, or back to the document's own when none is left. */
  release(): void;
}

interface Claim {
  key: object;
  color: string | null;
}

// Module state, the second beside the guest registry (src/shell/guest.ts): the claims on each document, oldest first. A
// document that goes away takes its claims with it.
const claims = new WeakMap<DocumentLike, Claim[]>();

function write(doc: DocumentLike, color: string | null): void {
  for (const element of [doc.documentElement, doc.body]) {
    if (color) element.style.setProperty('background-color', color, 'important');
    else element.style.removeProperty('background-color');
  }
}

/**
 * The most recent claimant owns the background, so it is the last connected panel that wins and hands back on leaving.
 * `key` is the panel (its element), so a second claim by the same panel replaces its first and makes it the most recent.
 */
export function claimDocument(doc: DocumentLike, key: object): DocumentClaim {
  const held = (claims.get(doc) ?? []).filter(c => c.key !== key);
  const claim: Claim = {key, color: null};
  held.push(claim);
  claims.set(doc, held);
  const owner = () => claims.get(doc)?.at(-1) === claim;
  return {
    paint(color) {
      claim.color = color;
      if (owner()) write(doc, color);
    },
    release() {
      const wasOwner = owner();
      const rest = (claims.get(doc) ?? []).filter(c => c !== claim);
      if (rest.length) claims.set(doc, rest);
      else claims.delete(doc);
      if (wasOwner) write(doc, rest.at(-1)?.color ?? null);
    },
  };
}
