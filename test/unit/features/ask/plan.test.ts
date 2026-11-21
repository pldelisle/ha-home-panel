// parsePlan: a model's reply, which is the least trusted input the panel reads, parsed once into the closed `Plan` or a `PlanError`. A
// table of replies each with the plan or the error it must give. Replies are written as Home Assistant hands them over: the six flat
// wire fields, the unused ones `null`, `test` the word `none` for a series.
import {describe, expect, test} from 'vitest';
import type {Catalog} from '../../../../src/features/ask/catalog.ts';
import {isPlanError, parsePlan} from '../../../../src/features/ask/plan.ts';

const catalog: Catalog = {
  entries: [
    {key: 'temp.office', name: 'Office', kind: 'measure', unit: '°'},
    {key: 'door.patio', name: 'Patio door', kind: 'binary', unit: ''},
    {key: 'energy.car', name: 'Car', kind: 'meter', unit: 'kWh'},
  ],
  entityOf: new Map(),
  omitted: 0,
};

/** A reply as the model returns it: every field present, the unused ones null. */
const reply = (over: Record<string, unknown>) => ({
  form: 'series',
  sensor: 'temp.office',
  period: 'yesterday',
  test: 'none',
  value: null,
  longer_than_min: null,
  ...over,
});

describe('a series, the form this slice answers', () => {
  test('the reply a model gives for "how warm was the office yesterday?"', () => {
    expect(parsePlan(reply({}), catalog)).toEqual({form: 'series', sensor: 'temp.office', period: 'yesterday'});
  });

  test('every period the plan names', () => {
    for (const period of [
      'today',
      'yesterday',
      'last_24h',
      'this_week',
      'last_week',
      'last_7_days',
      'this_month',
      'last_month',
      'last_30_days',
    ])
      expect(parsePlan(reply({period}), catalog)).toEqual({form: 'series', sensor: 'temp.office', period});
  });

  test('the fields a series does not use may arrive absent, null, empty or as the word none, alike', () => {
    const plan = {form: 'series', sensor: 'temp.office', period: 'yesterday'};
    expect(parsePlan(plan, catalog)).toEqual(plan);
    expect(parsePlan({...plan, test: null, value: null, longer_than_min: null}, catalog)).toEqual(plan);
    expect(parsePlan({...plan, test: '', value: '', longer_than_min: ''}, catalog)).toEqual(plan);
    expect(parsePlan({...plan, test: 'none'}, catalog)).toEqual(plan);
  });

  test('extra fields, and unused fields a model filled in anyway, change nothing', () => {
    expect(parsePlan(reply({test: 'above', value: 0, longer_than_min: 1, why: 'because'}), catalog)).toEqual({
      form: 'series',
      sensor: 'temp.office',
      period: 'yesterday',
    });
  });

  test('a series is of a measure: a binary sensor and a meter are a form and kind mismatch', () => {
    expect(parsePlan(reply({sensor: 'door.patio'}), catalog)).toEqual({error: 'form_kind_mismatch'});
    expect(parsePlan(reply({sensor: 'energy.car'}), catalog)).toEqual({error: 'form_kind_mismatch'});
  });
});

describe('unsupported', () => {
  test('is the answer to a question outside the vocabulary, whatever else the reply holds', () => {
    expect(parsePlan({form: 'unsupported'}, catalog)).toEqual({form: 'unsupported'});
    expect(parsePlan(reply({form: 'unsupported', sensor: null, period: null}), catalog)).toEqual({form: 'unsupported'});
    expect(parsePlan(reply({form: 'unsupported', sensor: 'nope', period: 'someday'}), catalog)).toEqual({
      form: 'unsupported',
    });
  });
});

describe('every PlanError, on the first field that fails', () => {
  test.each([
    ['null', null],
    ['nothing', undefined],
    ['a list', [reply({})]],
    ['a number', 5],
    ['text', 'series'],
    ['JSON as text, with words around it', 'Sure! {"form":"unsupported"}'],
  ])('%s is not an object', (_name, value) => {
    expect(parsePlan(value, catalog)).toEqual({error: 'not_an_object'});
  });

  test.each([['histogram'], [''], [null], [5], [undefined], ['Series']])('the form %s is unknown', form => {
    expect(parsePlan(reply({form}), catalog)).toEqual({error: 'unknown_form'});
  });

  test.each([['sensor.office'], ['temp.garage'], [''], [null], [5], [undefined], ['constructor'], ['TEMP.OFFICE']])(
    'the sensor %s is not in the catalog',
    sensor => {
      expect(parsePlan(reply({sensor}), catalog)).toEqual({error: 'unknown_sensor'});
    },
  );

  test.each([['tomorrow'], ['Yesterday'], [''], [null], [7], [undefined], ['toString']])(
    'the period %s is unknown',
    period => {
      expect(parsePlan(reply({period}), catalog)).toEqual({error: 'unknown_period'});
    },
  );

  test('a reply with several faults names the first in the order form, sensor, period, kind', () => {
    expect(parsePlan(reply({form: 'x', sensor: 'x', period: 'x'}), catalog)).toEqual({error: 'unknown_form'});
    expect(parsePlan(reply({sensor: 'x', period: 'x'}), catalog)).toEqual({error: 'unknown_sensor'});
    expect(parsePlan(reply({sensor: 'door.patio', period: 'x'}), catalog)).toEqual({error: 'unknown_period'});
  });

  test('a plan is a value to tell from an error', () => {
    expect(isPlanError({error: 'bad_test'})).toBe(true);
    expect(isPlanError({form: 'unsupported'})).toBe(false);
  });
});

describe('moments and totals are answered', () => {
  test('a reply for moments parses to a plan', () => {
    expect(parsePlan(reply({form: 'moments', sensor: 'door.patio', test: 'on', longer_than_min: 10}), catalog)).toEqual(
      {
        form: 'moments',
        sensor: 'door.patio',
        period: 'yesterday',
        test: {on: true},
        longerThanMin: 10,
      },
    );
    expect(parsePlan(reply({form: 'moments', sensor: 'temp.office', test: 'above', value: 23}), catalog)).toMatchObject(
      {
        form: 'moments',
        test: {above: 23},
      },
    );
  });

  test('a total is a plan of a meter, for any period, with the fields it does not use ignored', () => {
    expect(parsePlan(reply({form: 'total', sensor: 'energy.car', period: 'last_week'}), catalog)).toEqual({
      form: 'total',
      sensor: 'energy.car',
      period: 'last_week',
    });
    expect(
      parsePlan(reply({form: 'total', sensor: 'energy.car', test: 'above', value: 3, longer_than_min: 1}), catalog),
    ).toEqual({form: 'total', sensor: 'energy.car', period: 'yesterday'});
  });

  test('a total of a measure or a binary sensor, and a series of a meter, are form_kind_mismatch; the other faults keep their names', () => {
    for (const sensor of ['temp.office', 'door.patio'])
      expect(parsePlan(reply({form: 'total', sensor}), catalog)).toEqual({error: 'form_kind_mismatch'});
    expect(parsePlan(reply({form: 'series', sensor: 'energy.car'}), catalog)).toEqual({error: 'form_kind_mismatch'});
    expect(parsePlan(reply({form: 'total', sensor: 'energy.nope'}), catalog)).toEqual({error: 'unknown_sensor'});
    expect(parsePlan(reply({form: 'total', sensor: 'energy.car', period: 'x'}), catalog)).toEqual({
      error: 'unknown_period',
    });
  });

  test('the mismatches are errors: a binary needs on or off, a measure above or below, a meter is refused', () => {
    expect(parsePlan(reply({form: 'moments', sensor: 'door.patio', test: 'above', value: 1}), catalog)).toEqual({
      error: 'bad_test',
    });
    expect(parsePlan(reply({form: 'moments', sensor: 'temp.office', test: 'on'}), catalog)).toEqual({
      error: 'bad_test',
    });
    expect(parsePlan(reply({form: 'moments', sensor: 'energy.car', test: 'above', value: 1}), catalog)).toEqual({
      error: 'form_kind_mismatch',
    });
  });
});

describe('the moments, form by form', () => {
  test('moments over a binary sensor takes on or off, and a minimum length', () => {
    expect(
      parsePlan(
        reply({form: 'moments', sensor: 'door.patio', period: 'this_week', test: 'on', longer_than_min: 10}),
        catalog,
      ),
    ).toEqual({
      form: 'moments',
      sensor: 'door.patio',
      period: 'this_week',
      test: {on: true},
      longerThanMin: 10,
    });
    expect(parsePlan(reply({form: 'moments', sensor: 'door.patio', test: 'off'}), catalog)).toMatchObject({
      test: {on: false},
      longerThanMin: null,
    });
  });

  test('moments over a measure takes a threshold above or below, and 0 is a threshold', () => {
    const moments = (test: string, value: unknown) =>
      parsePlan(reply({form: 'moments', sensor: 'temp.office', test, value}), catalog);
    expect(moments('above', 23)).toMatchObject({test: {above: 23}});
    expect(moments('below', 19.5)).toMatchObject({test: {below: 19.5}});
    expect(moments('above', 0)).toMatchObject({test: {above: 0}});
  });

  test('the value is read only for above and below, and nothing is read as a number that is not one', () => {
    expect(parsePlan(reply({form: 'moments', sensor: 'door.patio', test: 'on', value: 0}), catalog)).toMatchObject({
      test: {on: true},
    });
    for (const value of [null, undefined, '', '23', Number.NaN, Infinity, true])
      expect(parsePlan(reply({form: 'moments', sensor: 'temp.office', test: 'above', value}), catalog)).toEqual({
        error: 'bad_test',
      });
  });

  test('a test that does not go with the kind, or is not a test, is bad_test', () => {
    const moments = (sensor: string, test: unknown) =>
      parsePlan(reply({form: 'moments', sensor, test, value: 20}), catalog);
    expect(moments('door.patio', 'above')).toEqual({error: 'bad_test'});
    expect(moments('door.patio', 'below')).toEqual({error: 'bad_test'});
    expect(moments('temp.office', 'on')).toEqual({error: 'bad_test'});
    expect(moments('temp.office', 'off')).toEqual({error: 'bad_test'});
    for (const test of ['none', '', null, undefined, 'sideways', 5]) {
      expect(moments('door.patio', test)).toEqual({error: 'bad_test'});
      expect(moments('temp.office', test)).toEqual({error: 'bad_test'});
    }
  });

  test('the minimum length: null, absent, empty and 0 are no minimum, a negative or a text is refused', () => {
    const longer = (value: unknown) =>
      parsePlan(reply({form: 'moments', sensor: 'door.patio', test: 'on', longer_than_min: value}), catalog);
    for (const none of [null, undefined, '', 0]) expect(longer(none)).toMatchObject({longerThanMin: null});
    expect(longer(2.5)).toMatchObject({longerThanMin: 2.5});
    for (const bad of [-5, '10', Number.NaN, true]) expect(longer(bad)).toEqual({error: 'bad_duration'});
  });

  test('moments are of a binary sensor or a measure, never a meter', () => {
    expect(parsePlan(reply({form: 'moments', sensor: 'energy.car', test: 'above', value: 1}), catalog)).toEqual({
      error: 'form_kind_mismatch',
    });
  });

  test('a total is of a meter, and its other fields are not read', () => {
    expect(
      parsePlan(reply({form: 'total', sensor: 'energy.car', period: 'last_week', test: 'above', value: 3}), catalog),
    ).toEqual({
      form: 'total',
      sensor: 'energy.car',
      period: 'last_week',
    });
    expect(parsePlan(reply({form: 'total', sensor: 'temp.office'}), catalog)).toEqual({error: 'form_kind_mismatch'});
    expect(parsePlan(reply({form: 'total', sensor: 'door.patio'}), catalog)).toEqual({error: 'form_kind_mismatch'});
  });
});
