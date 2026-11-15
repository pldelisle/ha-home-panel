// energyModel: the summary, the card, the water heater and Hilo cards and the phone's rows from the test house, from literal houses for each shape it does not show,
// from literal history, and from the recorded house when the owner has one; in English and in French, where the numbers are French's own.
import {describe, expect, test} from 'vitest';
import {HOUR_MS, MINUTE_MS} from '../../../../src/core/figures.ts';
import type {DailyRow, EnergyHistoryData} from '../../../../src/features/energy/history.ts';
import type {SankeyGeometry, SankeyLabel} from '../../../../src/features/energy/sankey-layout.ts';
import type {FlowRow} from '../../../../src/providers/power-history.ts';
import {readEnergy, type EnergyInputs} from '../../../../src/features/energy/inputs.ts';
import {energyModel, type EnergyModelDeps, type EnergyViewModel} from '../../../../src/features/energy/model.ts';
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
  detail: Pick<EnergyModelDeps, 'range' | 'sankeyMode'> = {},
): EnergyViewModel => {
  const {t, fmt, names} = depsOf(fullHouse, language);
  return energyModel(inputs, history, {now: NOW, t, fmt, names, language, error, ...detail});
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

describe('the detail', () => {
  const {fmt} = depsOf(fullHouse, 'en');
  const today = fmt.isoDay(NOW);
  const day = (key: string, over: Partial<DailyRow> = {}): DailyRow => ({
    day: key,
    heat: 10,
    wh: 4,
    ev: 0,
    rest: 6,
    total: 20,
    rooms: [4, 3, 2, 1],
    ...over,
  });
  // an hour of the Friday before the test house's Saturday, one at 5 am and one at 1 pm of the Saturday: [t, ev, wh, heat, rest, total]
  const flow: FlowRow[] = [
    [Date.parse('2026-11-06T15:00:00-05:00'), 0, 1, 5, 1, 8],
    [Date.parse('2026-11-07T05:00:00-05:00'), 0, 1, 2, 1, 4],
    [Date.parse('2026-11-07T13:00:00-05:00'), 0, 2, 6, 2.04, 10.04],
  ];
  const loaded = (over: Partial<EnergyHistoryData> = {}) =>
    history({
      flow,
      daily: [day('2026-11-06'), day(today)],
      g30: [300, 90, 40, 70],
      room30: [150, 100, 40, 10],
      ...over,
    });
  const detail = (
    over: Partial<EnergyHistoryData> | null,
    deps: Pick<EnergyModelDeps, 'range' | 'sankeyMode'> = {},
    language: Language = 'en',
  ) => modelOf(testHouse(), over === null ? null : loaded(over), language, null, deps).detail;
  const labelsOf = (view: ReturnType<typeof detail>['sankey']) =>
    (view.body as {geometry: SankeyGeometry}).geometry.items.filter(
      (item): item is SankeyLabel => item.kind === 'label',
    );

  test('the header: the title, the pane’s sentence under it, the four tabs from today to year', () => {
    const vm = modelOf(testHouse());
    expect(vm.detail).toMatchObject({title: 'Home energy', sub: vm.summary});
    expect(vm.detail.ranges.map(tab => [tab.range, tab.label])).toEqual([
      ['today', 'Today'],
      ['week', 'Week'],
      ['month', 'Month'],
      ['year', 'Year'],
    ]);
  });

  test('before the history: the loading word, no caption, the four uses in the legend, no donut and no totals', () => {
    const view = detail(null);
    expect(view.main).toMatchObject({title: 'Loading history…', caption: ''});
    expect(view.main.legend).toEqual([
      {key: 'heat', name: 'Room heating'},
      {key: 'wh', name: 'Water heating'},
      {key: 'ev', name: 'EV charging'},
      {key: 'rest', name: 'Rest of home'},
    ]);
    expect(view.donut).toMatchObject({title: 'Where it went', parts: [], rows: []});
    expect(view.totals).toMatchObject({title: 'Totals', hint: 'From the Hilo smart meter', tiles: []});
  });

  describe('the main chart’s words', () => {
    test('today: the busiest hour of the day’s hours, and none when there is no complete hour', () => {
      expect(detail({}).main).toMatchObject({
        title: 'Today, hour by hour',
        caption: 'Busiest hour: 10.0 kWh, 1:00 pm. Tap a bar to see what was running.',
      });
      expect(detail({flow: []}).main.caption).toBe('No complete hour yet today.');
    });

    test('the week: the same, with the day of the hour, over the last seven days', () => {
      expect(detail({}, {range: 'week'}).main).toMatchObject({
        title: 'Last 7 days, hour by hour',
        caption: 'Busiest hour: 10.0 kWh, Sat 1:00 pm. Tap a bar to see what was running.',
      });
      expect(detail({flow: [flow[0]]}, {range: 'week'}).main.caption).toContain('Fri 3:00 pm');
    });

    test('the month: the 30 days’ split in whole kWh', () => {
      expect(detail({}, {range: 'month'}).main).toMatchObject({
        title: 'Last 30 days, day by day',
        caption: '500 kWh in 30 days: room heating 300, water heating 90, EV charging 40, rest of home 70.',
      });
    });

    test('the year: the month the heating peaked in when it passed 50 kWh, else only the reminder', () => {
      const months = (heat: number): EnergyHistoryData['monthly'] => [
        ['2026-01', {heat: 300.4, wh: 0, ev: 0, rest: 0}],
        ['2026-02', {heat, wh: 0, ev: 0, rest: 0}],
      ];
      expect(detail({monthly: months(100)}, {range: 'year'}).main).toMatchObject({
        title: 'Month by month',
        caption: 'Last 12 months. Room heating peaked in January: 300 kWh. Months with missing data look shorter.',
      });
      const quiet = detail({monthly: [['2026-01', {heat: 50, wh: 0, ev: 0, rest: 0}]]}, {range: 'year'});
      expect(quiet.main.caption).toBe('Last 12 months. Months with missing data look shorter.');
      expect(detail({monthly: []}, {range: 'year'}).main.caption).toBe(quiet.main.caption);
    });

    test('in French the words and the figures are French’s own', () => {
      expect(detail({}, {}, 'fr').main.caption).toBe(
        'Heure la plus chargée : 10,0 kWh, 13 h. Touchez une barre pour voir ce qui fonctionnait.',
      );
      expect(detail({}, {}, 'fr').main.title).toBe("Aujourd'hui, heure par heure");
      const peak = detail({monthly: [['2026-01', {heat: 300, wh: 0, ev: 0, rest: 0}]]}, {range: 'year'}, 'fr');
      expect(peak.main.caption).toBe(
        '12 derniers mois. Le chauffage a culminé en janvier : 300 kWh. Les mois avec des données manquantes paraissent plus courts.',
      );
    });
  });

  describe('the Sankey', () => {
    test('now: the card’s own flow, with the live note and the three tabs', () => {
      const vm = modelOf(testHouse(), loaded());
      const {sankey} = vm.detail;
      expect(sankey).toMatchObject({title: 'Where the power goes', label: 'Sankey period'});
      expect(sankey.modes).toEqual([
        {mode: 'now', label: 'Now'},
        {mode: 'today', label: 'Today'},
        {mode: 'd30', label: '30 days'},
      ]);
      expect(sankey.note).toBe("Live power: the Hilo meter on the left, each device's own sensor on the right.");
      // the same geometry the card draws: no second layout
      expect(sankey.body.kind).toBe('flow');
      expect((sankey.body as {flow: unknown}).flow).toBe(vm.card.flow);
    });

    test('now without a grid reading says there is no data', () => {
      const inputs = testHouse();
      const dead = {...inputs, power: {...inputs.power, grid: 0}};
      const {t, fmt: formats, names} = depsOf(fullHouse, 'en');
      const {sankey} = energyModel(dead, null, {now: NOW, t, fmt: formats, names, language: 'en'}).detail;
      expect(sankey).toMatchObject({note: 'No data yet.', body: {kind: 'empty', text: 'No data yet'}});
    });

    test('today: the day’s uses and rooms as ribbons, the rooms named, and the note with the day’s total', () => {
      const {sankey} = detail({}, {sankeyMode: 'today'});
      expect(sankey.note).toBe('Energy since midnight, 20.0 kWh so far.');
      expect(labelsOf(sankey).map(label => [label.name, label.value])).toEqual([
        ['Grid', '20.0 kWh'],
        ['Room heating', '10.0 kWh'],
        ['Water heating', '4.0 kWh'],
        ['Rest of home', '6.0 kWh'],
        ['Bedroom', '4.0 kWh'],
        ['Garage', '3.0 kWh'],
        ['Living room', '2.0 kWh'],
        ['Office', '1.0 kWh'],
      ]);
    });

    test('today without a day that is today, or without the history, has nothing to draw', () => {
      const yesterday = detail({daily: [day('2026-11-06')]}, {sankeyMode: 'today'}).sankey;
      expect(yesterday).toMatchObject({note: 'No data yet.', body: {kind: 'empty', text: 'No data yet'}});
      expect(detail({daily: []}, {sankeyMode: 'today'}).sankey.body.kind).toBe('empty');
      expect(detail(null, {sankeyMode: 'today'}).sankey.body.kind).toBe('empty');
      expect(detail(null, {sankeyMode: 'd30'}).sankey.body.kind).toBe('empty');
    });

    test('30 days: the groups and rooms of the 30 days in whole kWh, and nothing when they add up to nothing', () => {
      const {sankey} = detail({}, {sankeyMode: 'd30'});
      expect(sankey.note).toBe('Last 30 days, 500 kWh in all.');
      expect(labelsOf(sankey).map(label => label.value)).toEqual([
        '500 kWh',
        '300 kWh',
        '90 kWh',
        '40 kWh',
        '70 kWh',
        '150 kWh',
        '100 kWh',
        '40 kWh',
        '10 kWh',
      ]);
      expect(detail({g30: [0, 0, 0, 0]}, {sankeyMode: 'd30'}).sankey.body.kind).toBe('empty');
    });

    test('a room the history has no figure for is a room with nothing', () => {
      const {sankey} = detail({room30: [150]}, {sankeyMode: 'd30'});
      expect(labelsOf(sankey).map(label => label.name)).toEqual([
        'Grid',
        'Room heating',
        'Water heating',
        'EV charging',
        'Rest of home',
        'Bedroom',
      ]);
    });

    test('in French the tabs, the note and the title are French', () => {
      const {sankey} = detail({}, {sankeyMode: 'd30'}, 'fr');
      expect(sankey.modes.map(mode => mode.label)).toEqual(['Maintenant', "Aujourd'hui", '30 jours']);
      expect(sankey.note).toBe('30 derniers jours, 500 kWh en tout.');
      expect(sankey.title).toBe('Où va l’électricité');
    });
  });

  describe('the donut and the totals', () => {
    test('the 30 days’ four slices with a tenth of a kWh and their share of the total', () => {
      const {donut} = detail({g30: [120.44, 55.5, 8.2, 300]});
      expect(donut.hint).toBe(
        'Last 30 days. Rest of home is everything without its own power sensor, including the heat pump.',
      );
      expect(donut.parts.map(part => [part.key, part.kwh])).toEqual([
        ['heat', 120.44],
        ['wh', 55.5],
        ['ev', 8.2],
        ['rest', 300],
      ]);
      expect(donut.rows).toEqual([
        {key: 'heat', name: 'Room heating', kwh: '120.4 kWh', share: '25%'},
        {key: 'wh', name: 'Water heating', kwh: '55.5 kWh', share: '11%'},
        {key: 'ev', name: 'EV charging', kwh: '8.2 kWh', share: '2%'},
        {key: 'rest', name: 'Rest of home', kwh: '300.0 kWh', share: '62%'},
      ]);
    });

    test('with nothing in the 30 days every share is zero, and French puts a narrow space before the sign', () => {
      expect(detail({g30: [0, 0, 0, 0]}).donut.rows.map(row => row.share)).toEqual(['0%', '0%', '0%', '0%']);
      expect(detail({g30: [1, 1, 1, 1]}, {}, 'fr').donut.rows[0]).toMatchObject({kwh: '1,0 kWh', share: '25 %'});
    });

    test('the six totals: today to a decimal until the time, yesterday, the 30 days with their daily mean, the month, the car and the rate', () => {
      const days = Array.from({length: 30}, (_, index) =>
        day(`2026-10-${String(index + 1).padStart(2, '0')}`, {ev: index < 3 ? 6 : 5}),
      );
      const view = detail({daily: days, totals: {today: 12.34, yesterday: 20.06, d30: 612.4, month: 100.4}});
      expect(view.totals.tiles).toEqual([
        {label: 'Today so far', value: '12.3', unit: 'kWh', sub: 'until 2:00 pm'},
        {label: 'Yesterday', value: '20.1', unit: 'kWh', sub: ''},
        {label: '30 days', value: '612', unit: 'kWh', sub: '20.4 kWh a day'},
        {label: 'November', value: '100', unit: 'kWh', sub: 'so far'},
        {label: 'EV, 30 days', value: '40', unit: 'kWh', sub: '3 charging days'},
        {label: 'Rate now', value: '–', unit: '¢', sub: 'Hilo rate unknown'},
      ]);
    });

    test('yesterday is a dash when no day says it, and one charging day is singular, none plural', () => {
      const totals = {today: 0, yesterday: null, d30: 0, month: 0};
      const one = detail({daily: [day(today, {ev: 6})], totals}).totals.tiles;
      expect([one[1].value, one[4].sub]).toEqual(['–', '1 charging day']);
      expect(detail({daily: []}).totals.tiles[4].sub).toBe('0 charging days');
    });

    test('the rate now is the current rate in cents, with the tier in lower case', () => {
      const vm = modelOf(inputsOf(), loaded());
      expect(vm.detail.totals.tiles[5]).toEqual({label: 'Rate now', value: '7.59', unit: '¢', sub: 'Hilo low tier'});
    });

    test('in French', () => {
      const tiles = detail({}, {}, 'fr').totals.tiles;
      expect(tiles.map(tile => tile.label)).toEqual([
        "Aujourd'hui jusqu'ici",
        'Hier',
        '30 jours',
        'novembre',
        'VÉ, 30 jours',
        'Tarif actuel',
      ]);
      expect(tiles[0].sub).toBe("jusqu'à 14 h");
      expect(tiles[4].sub).toBe('0 jours de recharge');
      expect(tiles[5].sub).toBe('Hilo tarif inconnu');
    });
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
