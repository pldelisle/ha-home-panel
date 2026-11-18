// sensorStatus: a sensor row's word ("Motion now") as the kit's status where the row says it is one: plain text with a dot, else the word as it is.
// Pattern: a template function over the kit's `.status` (HIG, Buttons: blue is the tint of what is tappable, and a fact is not); the dot has no tone, so it is the grey of what is merely happening, and the card adds the kit's `status` sheet to its styles.
// Must not: word the text (the model does, through the catalog), decide what is a status (the row's `status` does), read an entity or hold state.
import {html, type TemplateResult} from 'lit';
import type {SensorRow} from './model.ts';

/** The row's `main`, with a dot before it (which a screen reader skips: the word says it all) when the row is a status. */
export const sensorStatus = ({status, main}: Pick<SensorRow, 'status' | 'main'>): string | TemplateResult =>
  status ? html`<span class="status"><i aria-hidden="true"></i>${main}</span>` : main;
