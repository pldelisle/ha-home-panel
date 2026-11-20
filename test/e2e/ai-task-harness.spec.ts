// The harness's AI Task: the second adapter at the hass seam (ADR 0005) answers `ai_task.generate_data` from the table the test
// sets and records what was sent, as the Vitest fake does (test/houses/ai-task.mjs is the one reading of both). Spec 29, Ask the history.
import {test, expect} from './fixtures';

// what the panel's API client sends, from inside the page: the reply, or the rejection as a value
const ask = (instructions: string) => {
  const {callService} = (window as unknown as {hass: {callService: (...args: unknown[]) => Promise<unknown>}}).hass;
  return callService('ai_task', 'generate_data', {task_name: 'Ask', instructions}, undefined, false, true).catch(
    (error: unknown) => ({rejected: error}),
  );
};

test.describe('the question has an answer in the table', () => {
  test.use({houseOpts: {aiTask: {replies: {'attic warmest': {form: 'series', sensor: 'sensor.attic'}}}}});

  test('the reply is the data under response, and the call is recorded', async ({house}) => {
    const reply = await house.page.evaluate(ask, 'When was the attic warmest?');
    expect(reply).toMatchObject({response: {data: {form: 'series', sensor: 'sensor.attic'}}});
    expect((await house.generated()).map(({data}) => data.instructions)).toEqual(['When was the attic warmest?']);
  });

  test('a question that is not in the table is unsupported', async ({house}) => {
    const reply = await house.page.evaluate(ask, 'Something else');
    expect(reply).toMatchObject({response: {data: {form: 'unsupported'}}});
  });
});

test.describe('the AI Task fails', () => {
  test.use({houseOpts: {aiTask: {replies: {}, fail: true}}});

  test('the call rejects as the socket does', async ({house}) => {
    const reply = await house.page.evaluate(ask, 'anything');
    expect(reply).toMatchObject({rejected: {code: 'unknown_error'}});
  });
});
