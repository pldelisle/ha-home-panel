// energyModel: the summary, the card, the water heater and Hilo cards and the phone's rows from the test house, from literal houses for each shape it does not show,
// from literal history, and from the recorded house when the owner has one; in English and in French, where the numbers are French's own.
import {describe, expect, test} from 'vitest';
import {HOUR_MS, MINUTE_MS} from '../../../../src/core/figures.ts';
import type {EnergyHistoryData} from '../../../../src/features/energy/history.ts';
import {readEnergy, type EnergyInputs} from '../../../../src/features/energy/inputs.ts';
import {energyModel, type EnergyViewModel} from '../../../../src/features/energy/model.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {entity, fakeHass} from '../../fake-hass.ts';
import {depsOf, fullHouse, houseOf, NOW, readingOf, recorded, storeOf, type Language} from '../media/support.ts';

type State = ReturnType<typeof entity>;

const ENTITIES = {
  hilo_rate: 'sensor.rate',
  hilo_rate_low: 'sensor.low',
  hilo_rate_medium: 'sensor.medium',
  hilo_rate_reward: 'sensor.reward',
  hilo_challenge: 'sensor.challenge',
  hilo_rewards: 'sensor.rewards',
  water_heater_temperature: 'sensor.tank_temperature',
  water_heater_power: 'sensor.tank_power',
  grid_power: 'sensor.grid',
};

const hiloStates = (rate: string, challenge: string | null = 'off'): State[] => [
  entity('sensor.rate', rate),
  entity('sensor.low', '0.0759'),
  entity('sensor.medium', '0.1'),
  entity('sensor.reward', '1.0'),
  ...(challenge === null ? [] : [entity('sensor.challenge', challenge)]),
  entity('sensor.rewards', '85'),
];

/** The inputs of a house of literal states: Hilo, a tank of 49.5 degrees heating at 1.2 kW, and a grid reading of 2.3 kW. */
const inputsOf = (states: State[] = hiloStates('0.0759')): EnergyInputs => {
  const hass = houseOf(
    [],
    [
      entity('sensor.grid', '2.3', {unit_of_measurement: 'kW'}),
      entity('sensor.tank_temperature', '49.5', {friendly_name: 'Tank Temperature'}),
      entity('sensor.tank_power', '1200', {unit_of_measurement: 'W'}),
      ...states,
    ],
  );
  const store = storeOf(hass, {entities: ENTITIES});
  return readEnergy(hass.states, store.config, store.names);
};

const testHouse = (): EnergyInputs => {
  const {states, names} = readingOf(fullHouse);
  return readEnergy(states, storeOf(fullHouse, FULL_CFG).config, names);
};

const modelOf = (
  inputs: EnergyInputs,
  history: EnergyHistoryData | null = null,
  language: Language = 'en',
  error: string | null = null,
): EnergyViewModel => {
  const {t, fmt} = depsOf(fullHouse, language);
  return energyModel(inputs, history, {now: NOW, t, fmt, error});
};

/** A loaded history: the meter's day, a month's split, five-minute power for the last three hours and two daily totals of the water heater. */
const history = (over: Partial<EnergyHistoryData> = {}): EnergyHistoryData => ({
  at: NOW,
  flow: [],
  daily: [],
  g30: [120.4, 55.5, 8.2, 300],
  room30: [],
  monthly: [],
  totals: {today: 12.34, yesterday: 20, d30: 400, month: 100},
  wh24: {
    t: [
      [NOW - 3 * HOUR_MS, 48],
      [NOW - HOUR_MS, 51],
    ],
    p: [
      [NOW - 3 * HOUR_MS - 10 * MINUTE_MS, 1.2],
      [NOW - 3 * HOUR_MS - 5 * MINUTE_MS, 1.2],
      [NOW - 3 * HOUR_MS, 0],
      [NOW - HOUR_MS, 1],
    ],
  },
  wh14: [
    ['2026-11-05', 4],
    ['2026-11-06', 5],
  ],
  ...over,
});

describe('the test house', () => {
  const vm = modelOf(testHouse());

  test('no Hilo: the summary and the card’s top line say the tier is unknown, as the legacy panel did', () => {
    expect(vm.summary).toBe('Grid supplying 3.24 kW · room heating 2.40 kW · Hilo rate unknown');
    expect(vm.card.topRight).toBe('Grid only · rate unknown');
    expect(vm.card).toMatchObject({title: 'Home energy', open: 'Open home energy details', error: null});
  });

  test('the card’s flow is the layout of the same power, the charger’s own status included', () => {
    expect(vm.card.flow.label).toBe(
      'Grid supplies 3.24 to the home; room heating 2.40; water heating 0 W; EV charging 7.10',
    );
    expect(vm.card.flow.labels.map(l => l.text)).toContain('Charging');
    expect(vm.card.flow.nodes.find(n => n.key === 'water')!.texts[1].text).toBe('50.0°');
  });

  test('before the history, four tiles of dashes with their units and the 30-day caption', () => {
    expect(vm.card.tiles).toEqual([
      {label: 'Today', value: '–', unit: 'kWh', sub: ''},
      {label: 'Room heating', value: '–', unit: 'kWh', sub: 'last 30 days'},
      {label: 'Water heating', value: '–', unit: 'kWh', sub: 'last 30 days'},
      {label: 'EV charging', value: '–', unit: 'kWh', sub: 'last 30 days'},
    ]);
    expect(vm.water).toMatchObject({chart: null, legend: [], line: null});
  });

  test('an idle water heater: its figure, its state, no Hilo card and only its row on the phone', () => {
    expect(vm.water).toMatchObject({
      present: true,
      title: 'Water heater',
      name: '',
      temperature: {value: '50.0', unit: '°C'},
      state: {heating: false, text: 'Idle · 0 W'},
    });
    expect(vm.hilo.present).toBe(false);
    expect(vm.tiles).toEqual([{key: 'water', label: 'Water heater', sub: 'Idle', value: '50.0', unit: '°', on: false}]);
  });
});

describe('Hilo', () => {
  test('the low tier: the summary, the top line, the hero and the rate’s tier word, in the "ok" colour', () => {
    const vm = modelOf(inputsOf());
    expect(vm.summary).toBe('Grid supplying 2.30 kW · room heating 0.00 kW · Hilo low rate');
    expect(vm.card.topRight).toBe('Grid only · low rate');
    expect(vm.hilo).toMatchObject({
      present: true,
      title: 'Hilo',
      challenge: 'No challenge scheduled',
      rate: {value: '7.59', unit: '¢/kWh'},
      tier: {text: 'Low tier', ok: true},
    });
  });

  test('no grid reading: a dash for the grid in the summary, and the heating still counted', () => {
    const hass = houseOf([], hiloStates('0.0759'));
    const store = storeOf(hass, {entities: ENTITIES});
    const vm = modelOf(readEnergy(hass.states, store.config, store.names));
    expect(vm.summary).toBe('Grid supplying – kW · room heating 0.00 kW · Hilo low rate');
  });

  test('the three tiles: the medium and reward rates in cents, the rewards in dollars', () => {
    expect(modelOf(inputsOf()).hilo.tiles).toEqual([
      {label: 'Medium', value: '10.00', unit: '¢', sub: ''},
      {label: 'Reward', value: '100.00', unit: '¢', sub: ''},
      {label: 'Rewards', value: '85', unit: '$', sub: ''},
    ]);
  });

  test.each([
    ['0.1', 'Medium tier', 'medium rate'],
    ['1.0', 'Challenge rate', 'challenge rate'],
    ['0.5', 'Current rate', 'current rate'],
  ])('a rate of %s is the %s, which the summary calls the %s and the tier is not "ok"', (rate, tier, short) => {
    const vm = modelOf(inputsOf(hiloStates(rate)));
    expect(vm.hilo.tier).toEqual({text: tier, ok: false});
    expect(vm.summary).toBe(`Grid supplying 2.30 kW · room heating 0.00 kW · Hilo ${short}`);
    expect(vm.card.topRight).toBe(`Grid only · ${short}`);
  });

  test('no reading at all: dashes, the unknown tier, and a challenge sensor that is missing says so', () => {
    const vm = modelOf(inputsOf([entity('sensor.rate', 'unavailable')]));
    expect(vm.hilo).toMatchObject({
      present: true,
      challenge: 'Challenge status unknown',
      rate: {value: '–'},
      tier: {text: 'Rate unknown', ok: false},
    });
    expect(vm.hilo.tiles.map(tile => tile.value)).toEqual(['–', '–', '–']);
  });

  test('a challenge is worded by its phase, and a phase the catalog does not know is shown as the sensor says it', () => {
    const challenge = (state: string) => modelOf(inputsOf(hiloStates('0.0759', state))).hilo.challenge;
    expect(challenge('off')).toBe('No challenge scheduled');
    expect(challenge('pre_heat')).toBe('Challenge: pre_heat');
    expect(challenge('appreciation')).toBe('Challenge: appreciation');
    expect(challenge('reduction')).toBe('Challenge: reduction');
    expect(challenge('recovery')).toBe('Challenge: recovery');
    expect(challenge('scheduled')).toBe('Challenge: scheduled');
  });

  test('the phone’s two rows: the tank heating, and Hilo with its tier and its challenge', () => {
    expect(modelOf(inputsOf(hiloStates('0.0759', 'pre_heat'))).tiles).toEqual([
      {key: 'water', label: 'Water heater', sub: 'Heating · 1.2 kW', value: '49.5', unit: '°', on: true},
      {key: 'hilo', label: 'Hilo', sub: 'Low tier · Challenge: pre_heat', value: '7.59', unit: '¢', on: false},
    ]);
  });
});

describe('the water heater', () => {
  test('heating: its power to a decimal, in the hero and under the flow’s ring', () => {
    const vm = modelOf(inputsOf());
    expect(vm.water.state).toEqual({heating: true, text: 'Heating · 1.2 kW'});
    expect(vm.water.name).toBe('Tank');
  });

  test('the 24 hours: the chart, its legend and the line with the two sentences, once the history is there', () => {
    const vm = modelOf(inputsOf(), history());
    expect(vm.water.chart).not.toBeNull();
    expect(vm.water.legend).toEqual([
      {kind: 'line', label: 'Water temperature'},
      {kind: 'bars', label: 'Heating power'},
    ]);
    expect(vm.water.line).toBe('Last 24 hours: 0.3 kWh over 2 heating cycles. 2-day average: 4.5 kWh a day.');
  });

  test('one cycle is singular, none is plural, and no daily totals leave the second sentence out', () => {
    const one = history({wh24: {t: [], p: [[NOW - HOUR_MS, 1.2]]}, wh14: []});
    expect(modelOf(inputsOf(), one).water.line).toBe('Last 24 hours: 0.1 kWh over 1 heating cycle.');
    const none = history({wh24: {t: [], p: [[NOW - HOUR_MS, 0]]}, wh14: []});
    expect(modelOf(inputsOf(), none).water.line).toBe('Last 24 hours: 0.0 kWh over 0 heating cycles.');
  });

  test('a day with nothing to draw has the legend and the line and no chart', () => {
    const vm = modelOf(inputsOf(), history({wh24: {t: [], p: []}}));
    expect(vm.water).toMatchObject({
      chart: null,
      line: 'Last 24 hours: 0.0 kWh over 0 heating cycles. 2-day average: 4.5 kWh a day.',
    });
    expect(vm.water.legend).toHaveLength(2);
  });

  test('without a water heater the card is not present, and neither is its row', () => {
    const hass = houseOf([], [entity('sensor.grid', '2.3')]);
    const store = storeOf(hass, {entities: ENTITIES});
    const vm = modelOf(readEnergy(hass.states, store.config, store.names));
    expect(vm.water).toMatchObject({present: false, temperature: {value: '–'}});
    expect(vm.tiles).toEqual([]);
  });
});

describe('the tiles and the error line', () => {
  test('with history: today to a decimal, the groups rounded to whole kWh', () => {
    expect(modelOf(testHouse(), history()).card.tiles.map(t => [t.label, t.value])).toEqual([
      ['Today', '12.3'],
      ['Room heating', '120'],
      ['Water heating', '56'],
      ['EV charging', '8'],
    ]);
  });

  test('the error line words the reason, and no error leaves none', () => {
    expect(modelOf(testHouse(), null, 'en', 'timeout').card.error).toBe(
      "History didn't load: timeout. Live values still update.",
    );
    expect(modelOf(testHouse(), history()).card.error).toBeNull();
  });
});

describe('in French', () => {
  test('the test house: the summary, the top line, the tiles and the water heater', () => {
    const vm = modelOf(testHouse(), history(), 'fr', 'délai dépassé');
    expect(vm.summary).toBe('Réseau 3,24 kW · chauffage 2,40 kW · Hilo tarif inconnu');
    expect(vm.card.topRight).toBe('Réseau seulement · tarif inconnu');
    expect(vm.card.tiles.map(t => [t.label, t.value, t.sub])).toEqual([
      ["Aujourd'hui", '12,3', ''],
      ['Chauffage des pièces', '120', '30 derniers jours'],
      ['Chauffe-eau', '56', '30 derniers jours'],
      ['Recharge VÉ', '8', '30 derniers jours'],
    ]);
    expect(vm.card.error).toBe(
      "L'historique n'a pas pu être chargé : délai dépassé. Les valeurs en direct continuent de se mettre à jour.",
    );
    expect(vm.water).toMatchObject({title: 'Chauffe-eau', state: {text: 'Au repos · 0 W'}});
    expect(vm.water.line).toBe(
      '24 dernières heures : 0,3 kWh en 2 cycles de chauffe. Moyenne sur 2 jours : 4,5 kWh par jour.',
    );
  });

  test('Hilo: the tier, the challenge and the tiles, and the phone’s row', () => {
    const vm = modelOf(inputsOf(hiloStates('0.0759', 'pre_heat')), null, 'fr');
    expect(vm.hilo).toMatchObject({
      challenge: 'Défi : préchauffage',
      rate: {value: '7,59', unit: '¢/kWh'},
      tier: {text: 'Palier bas'},
    });
    expect(vm.hilo.tiles.map(t => [t.label, t.value])).toEqual([
      ['Moyen', '10,00'],
      ['Récompense', '100,00'],
      ['Récompenses', '85'],
    ]);
    expect(vm.tiles[1].sub).toBe('Palier bas · Défi : préchauffage');
    expect(vm.summary).toBe('Réseau 2,30 kW · chauffage 0,00 kW · Hilo tarif bas');
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the model is tested on the test house', () => {});
    return;
  }

  test.each(['en', 'fr'] as const)('gives a summary, four tiles and a flow, in %s', language => {
    const hass = fakeHass.fromFixture('main');
    const store = storeOf(hass);
    const vm = modelOf(readEnergy(hass.states, store.config, store.names), null, language);
    expect(vm.summary).not.toBe('');
    expect(vm.card.tiles).toHaveLength(4);
    expect(vm.card.flow.nodes).toHaveLength(5);
  });
});
