// motionNow: the words "Motion now" as a status: plain text with a green dot, the Home card's sensor line and the Security tab's chip.
// Pattern: a template function over the kit's `.status` (HIG, Buttons: blue is the tint of what is tappable, and a fact is not); the card adds the kit's `status` sheet to its styles.
// Must not: word the text (the model does, through the catalog), read an entity or hold state.
import {html, type TemplateResult} from 'lit';

/** `text` with the `.ok` dot before it, which a screen reader skips: the word says it all. */
export const motionNow = (text: string): TemplateResult =>
  html`<span class="status ok"><i aria-hidden="true"></i>${text}</span>`;
