// The AI Task entity of a test house: the reply `ai_task.generate_data` gives to a question, from a table the test sets.
// Pattern: a table-driven fake (a stub with canned answers, after Meszaros, xUnit Test Patterns), shared by the Vitest fake
// and the e2e harness so the two adapters at the hass seam (ADR 0005) answer one way and cannot drift.
// The harness's `failNext` does not apply to `ai_task.generate_data`: `fail` is its only way to fail. Both adapters record the same
// fields of a call (`domain`, `service`, `data`, `notifyOnError`, `returnResponse`).
// Must not: read the clock, touch the page, or hold a state: the options and the call come in, the reply comes out.

/** What a house answers when no question in the table matches: the plan's own way to say "I cannot do that". */
export const UNSUPPORTED = {form: 'unsupported'};

/**
 * @typedef {{replies: Record<string, unknown>, delayMs?: number, fail?: boolean}} AiTaskOptions
 *   `replies` is keyed by a substring of the instructions (the question); `delayMs` holds the reply back; `fail` rejects as the
 *   socket does.
 */

/**
 * What `hass.callService('ai_task', 'generate_data', data, undefined, false, true)` resolves to: `{context, response}`, the
 * response being `{conversation_id, data}` with `data` the parsed object.
 * @param {AiTaskOptions} options
 * @param {{instructions?: string}} data
 * @returns {Promise<{context: object, response: {conversation_id: string, data: unknown}}>}
 */
export async function answerAiTask(options, data) {
  if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs));
  if (options.fail) throw {code: 'unknown_error', message: 'the AI Task failed on purpose'};
  const question = String(data.instructions ?? '');
  const key = Object.keys(options.replies).find(k => question.includes(k));
  return {
    context: {id: 'ctx', parent_id: null, user_id: null},
    response: {conversation_id: 'conversation', data: key === undefined ? UNSUPPORTED : options.replies[key]},
  };
}
