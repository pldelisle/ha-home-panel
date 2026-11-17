// The Home pane's tile readers (#267): each feature's `glance` against the full and the bare test house, in English and in French,
// and each rule the legacy `renderHome` had, with the one reading a case is about replaced. A reader returns null where the house
// has nothing for the tile, which is how the bare house loses Climate, Car, Water heater and Air.
import {describe, expect, test} from 'vitest';
import {glance as airGlance} from '../../../src/features/air/glance.ts';
import {glance as carGlance} from '../../../src/features/car/glance.ts';
import {glance as climateGlance} from '../../../src/features/climate/glance.ts';
import {glance as energyGlance, waterGlance, type GlanceDeps} from '../../../src/features/energy/glance.ts';
import {glance as lightsGlance} from '../../../src/features/lights/glance.ts';
import type {GlanceStore} from '../../../src/ui/glance.ts';
import * as bare from '../../houses/bare.mjs';
import {FULL_CFG} from '../../e2e/houses.ts';
import {fakeHass, type FakeHass} from '../fake-hass.ts';
import {fullHouse, NOW, storeOf} from './media/support.ts';

const bareHouse = fakeHass.fromHouse(bare);
const inLanguage = (hass: FakeHass, language: string) => ({...hass, locale: {...hass.locale, language}}) as FakeHass;
const full = (patch: Parameters<FakeHass['next']>[0] = {}, config: object = FULL_CFG, language = 'en') =>
  storeOf(inLanguage(fullHouse.next(patch), language), config);
const history: GlanceDeps = {
  history: {totals: {today: 12.34, yesterday: null, d30: 0, month: 0}, wh24: {t: [], p: [[NOW - 3_600_000, 2.4]]}},
  now: NOW,
};
const noHistory: GlanceDeps = {history: null, now: NOW};
const all = (store: GlanceStore, deps = history) =>
  [
    lightsGlance(store),
    climateGlance(store),
    carGlance(store),
    energyGlance(store, deps),
    waterGlance(store, deps),
    airGlance(store),
  ].map(tile => tile && [tile.key, tile.value, tile.line]);

describe('the test houses', () => {
  test('the full house has the six tiles, in English', () => {
    expect(all(full())).toStrictEqual([
      ['lights', '4 on', 'Kitchen 59% · Living room 71% · Office 78%'],
      ['climate', '20.6°', 'Inside · 2 rooms heating'],
      ['car', '64.0%', '280 km · charging · locked'],
      ['energy', '3.24 kW', 'Now · 12.3 kWh today · rate unknown'],
      ['water', '50.0°', 'Idle · 0.2 kWh today'],
      ['air', 'Moderate', '1 purifier · Office: PM2.5 20'],
    ]);
  });

  test('and in French', () => {
    expect(all(full({}, FULL_CFG, 'fr'))).toStrictEqual([
      ['lights', '4 allumées', 'Bureau 78% · Cuisine 59% · Salon 71%'],
      ['climate', '20,6°', 'Intérieur · 2 pièces chauffent'],
      ['car', '64,0\u202f%', '280 km · en recharge · verrouillée'],
      ['energy', '3,24 kW', "Maintenant · 12,3 kWh aujourd'hui · tarif inconnu"],
      ['water', '50,0°', "Au repos · 0,2 kWh aujourd'hui"],
      ['air', 'Moyen', '1 purificateur · Bureau : PM2,5 20'],
    ]);
  });

  test('the bare house has Lights and Energy only, in both languages', () => {
    expect(all(storeOf(bareHouse))).toStrictEqual([
      ['lights', '1 on', 'Living room 71%'],
      null,
      null,
      ['energy', '–', 'Now · 12.3 kWh today · rate unknown'],
      null,
      null,
    ]);
    expect(all(storeOf(inLanguage(bareHouse, 'fr')))[0]).toStrictEqual(['lights', '1 allumée', 'Salon 71%']);
  });

  test('no tile before the first states', () => {
    const store = {...storeOf(bareHouse), hass: null};
    expect(all(store)).toStrictEqual([null, null, null, null, null, null]);
  });

  test('each tile goes to its tab, and on a phone to its sheet', () => {
    const store = full();
    expect(
      [
        lightsGlance(store),
        climateGlance(store),
        carGlance(store),
        energyGlance(store, history),
        waterGlance(store, history),
        airGlance(store),
      ].map(tile => tile?.go),
    ).toStrictEqual([
      {tab: 'lights'},
      {tab: 'climate', sheet: 'climate.detail'},
      {tab: 'car', sheet: 'car.detail'},
      {tab: 'energy', sheet: 'energy.detail'},
      {tab: 'energy', sheet: 'energy.water'},
      {tab: 'air', sheet: 'air.detail'},
    ]);
    expect(carGlance(store)?.charging).toBe(true);
  });
});

describe('Lights', () => {
  const off = Object.fromEntries(
    Object.keys(fullHouse.states)
      .filter(id => id.startsWith('light.'))
      .map(id => [id, {state: 'off'}]),
  );

  test('says All off and Nothing on when no light is on', () => {
    expect(lightsGlance(full(off))).toMatchObject({value: 'All off', line: 'Nothing on'});
  });

  test('names the lights with no area Other lights, and reads a light with no brightness as 0%', () => {
    const tile = lightsGlance(full({...off, 'light.porch': {state: 'on', attributes: {friendly_name: 'Porch'}}}));
    expect(tile).toMatchObject({value: '1 on', line: 'Other lights 0%'});
  });
});

describe('Climate', () => {
  const withHp = {...FULL_CFG, entities: {...FULL_CFG.entities, heat_pump: 'climate.heat_pump'}};
  const hp = (state: string, hvac_action?: string) =>
    climateGlance(full({'climate.heat_pump': {state, attributes: hvac_action ? {hvac_action} : {}}}, withHp))?.line;

  test('says what the heat pump does: off, offline, an action the catalog words, or the state as sent', () => {
    expect(hp('off')).toBe('Inside · 2 rooms heating · heat pump off');
    expect(hp('unavailable')).toBe('Inside · 2 rooms heating · heat pump offline');
    expect(hp('heat', 'heating')).toBe('Inside · 2 rooms heating · heat pump heating');
    expect(hp('heat', 'defrosting')).toBe('Inside · 2 rooms heating · heat pump defrosting');
    expect(climateGlance(full({}, withHp))?.line).toBe('Inside · 2 rooms heating · heat pump offline');
  });

  test('in French, the heat pump and its action', () => {
    const french = climateGlance(
      full({'climate.heat_pump': {state: 'heat', attributes: {hvac_action: 'heating'}}}, withHp, 'fr'),
    );
    expect(french?.line).toBe('Intérieur · 2 pièces chauffent · thermopompe : chauffe');
  });

  test('a dash when no room reads a temperature', () => {
    const silent = Object.fromEntries(
      Object.keys(fullHouse.states)
        .filter(id => id.startsWith('climate.') || /temperature/.test(id))
        .map(id => [id, {state: 'unavailable', attributes: {current_temperature: null}}]),
    );
    expect(climateGlance(full(silent))?.value).toBe('–');
  });
});

describe('Car', () => {
  test('without a charge, a range or a lock reading, unplugged or plugged in', () => {
    const quiet = {
      'sensor.fordpass_test_soc': {state: 'unknown', attributes: {batteryRange: null}},
      'sensor.fordpass_test_elveh': {state: 'unknown'},
      'lock.fordpass_test_doorlock': {state: 'unavailable'},
      'sensor.fordpass_test_elvehcharging': {state: 'NOT_CHARGING'},
    };
    expect(carGlance(full({...quiet, 'sensor.fordpass_test_elvehplug': {state: 'DISCONNECTED'}}))).toMatchObject({
      value: '–%',
      line: 'unplugged',
      charging: false,
    });
    expect(carGlance(full({...quiet, 'sensor.fordpass_test_elvehplug': {state: 'CONNECTED'}}))?.line).toBe(
      'plugged in',
    );
  });
});

describe('Energy and the water heater', () => {
  test('the grid under a kilowatt in watts, a dash without a reading, and no total before the history', () => {
    expect(energyGlance(full({'sensor.house_power': {state: '850'}}), noHistory)).toMatchObject({
      value: '850 W',
      line: 'Now · rate unknown',
    });
    expect(energyGlance(full({'sensor.house_power': {state: 'unavailable'}}), history)?.value).toBe('–');
  });

  test('the water heater heating, without a temperature, and before the history', () => {
    const tile = waterGlance(
      full({'sensor.water_heater_power': {state: '3000'}, 'sensor.water_heater_temperature': {state: 'unknown'}}),
      noHistory,
    );
    expect(tile).toMatchObject({value: '–', line: 'Heating'});
  });
});

describe('Air', () => {
  const mila = Object.keys(fullHouse.states).filter(id => /^sensor\.office_purifier_(pm|co|voc|air_quality)/.test(id));

  test('clean air everywhere, and no data when no room reads', () => {
    const clean = Object.fromEntries(mila.map(id => [id, {state: id.endsWith('co2') ? '450' : '1'}]));
    expect(airGlance(full(clean))).toMatchObject({value: 'Good', line: '1 purifier · clean air everywhere'});
    const silent = Object.fromEntries(mila.map(id => [id, {state: 'unavailable'}]));
    expect(airGlance(full(silent))).toMatchObject({value: 'No data', line: '1 purifier · clean air everywhere'});
  });
});
