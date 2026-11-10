// claimPage: who writes the page's background colour, so two panels on one page do not fight over it.
// Pattern: Registry (Fowler, Patterns of Enterprise Application Architecture): a map from the page to the panels that
// claim it, the most recently connected one owning it. The one place outside the kit that writes `document`.
// Must not: read a style or a media query, know what colour means (the controller reads the wallpaper's), or outlive a claim.

/** The slice of a style that the background needs; `CSSStyleDeclaration` fits. */
interface StyleLike {
  setProperty(name: string, value: string, priority?: string): void;
  removeProperty(name: string): string;
}

/** The page: the two elements whose background shows in the overscroll bounce. `document` fits. */
export interface PageLike {
  documentElement: {style: StyleLike};
  body: {style: StyleLike};
}

/** What one panel holds of the page: it says what colour it wants, and gives the page back when it leaves. */
export interface PageClaim {
  /** The colour this panel wants behind the page, or null for the page's own. Written only while this panel owns the page. */
  paint(color: string | null): void;
  /** The panel leaves: the page goes to the previous claimant in its colour, or back to its own when none is left. */
  release(): void;
}

interface Claim {
  key: object;
  color: string | null;
}

// Module state, the second beside the guest registry (src/shell/guest.ts): the claims of each page, oldest first. A page
// that goes away takes its claims with it.
const claims = new WeakMap<PageLike, Claim[]>();

function write(page: PageLike, color: string | null): void {
  for (const element of [page.documentElement, page.body]) {
    if (color) element.style.setProperty('background-color', color, 'important');
    else element.style.removeProperty('background-color');
  }
}

/**
 * The most recent claimant owns the page, as the last panel to write did before. `key` is the panel (its element), so a
 * second claim by the same panel replaces its first and makes it the most recent.
 */
export function claimPage(page: PageLike, key: object): PageClaim {
  const held = (claims.get(page) ?? []).filter(c => c.key !== key);
  const claim: Claim = {key, color: null};
  held.push(claim);
  claims.set(page, held);
  const owner = () => claims.get(page)?.at(-1) === claim;
  return {
    paint(color) {
      claim.color = color;
      if (owner()) write(page, color);
    },
    release() {
      const wasOwner = owner();
      const rest = (claims.get(page) ?? []).filter(c => c !== claim);
      if (rest.length) claims.set(page, rest);
      else claims.delete(page);
      if (wasOwner) write(page, rest.at(-1)?.color ?? null);
    },
  };
}
