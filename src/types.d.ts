// Types for the smart-stack module (stack.js), checked by `npm run typecheck` (tsc --checkJs, strict) and reached from
// that file with /** @typedef {import('./types.d.ts').X} X */, because the file is still plain JavaScript, not
// TypeScript. This file is never built or shipped. The config types are in src/core/config.ts, inferred from its schema.

/**
 * The card pickStack() chooses among. `tone` 'red' pins it, 'amber' puts it first;
 * a card without a tone is neutral.
 */
export interface StackCard {
  k: string;
  tone: 'red' | 'amber' | null;
  filler: boolean;
  /** The card's markup, built by scard() in the main class. */
  html: string;
}
