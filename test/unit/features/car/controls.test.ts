// The Car's two control cards as strings, numbers and flags: from the test house (a charger at 32 A of 6 to 40, charging, unlocked, and a locked car with no comfort sensors), from literal houses for
// every shape it does not show (a car with all its switches, held values, a second tap waiting, a current outside the steps, a charger that is gone), in English and in French.
import {describe, expect, test} from 'vitest';
import {
  carActions,
  chargerControls,
  departureControls,
  type ControlsDeps,
} from '../../../../src/features/car/controls.ts';
import {readCarFeature} from '../../../../src/features/car/inputs.ts';
import {K} from '../../../../src/features/car/keys.ts';
import {draftFromSchedule} from '../../../../src/features/car/schedule.ts';
import {pauseHold} from '../../../../src/providers/wallbox.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {entity, type FakeHass} from '../../fake-hass.ts';
import {depsOf, fullHouse, houseOf, storeOf, type Language} from '../media/support.ts';

const PREFIX = 'fordpass_t';
const car = (domain: string, key: string, state: string | number, attributes: Record<string, unknown> = {}) =>
  entity(`${domain}.${PREFIX}_${key}`, String(state), attributes);

type State = ReturnType<typeof entity>;

/** The states of a car with every switch the controls read, and a charger; `over` replaces one by its id, `null` takes it out. */
function carHouse(over: Record<string, State | null> = {}): FakeHass {
  const states = [
    car('sensor', 'soc', 64),
    car('sensor', 'elvehcharging', 'CHARGING', {globalAcTargetSoc: 80}),
    car('sensor', 'elvehplug', 'CONNECTED'),
    car('sensor', 'doorstatus', 'CLOSED', {driverFront: 'CLOSED', hood: 'CLOSED', tailgate: 'CLOSED'}),
    car('sensor', 'windowposition', 'Closed'),
    car('sensor', 'departureschedules', 'ok', {
      schedule: Object.fromEntries(
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => [
          day,
          {timeOfDay: {hours: 8, minutes: 30}},
        ]),
      ),
    }),
    car('lock', 'doorlock', 'locked'),
    car('switch', 'departuretimes', 'on'),
    car('switch', 'ignition', 'off'),
    car('switch', 'rccdefrostfront', 'on'),
    car('switch', 'rccdefrostrear', 'off'),
    car('switch', 'rccsteeringwheel', 'off'),
    car('select', 'rcctemperature', 'hi'),
    car('select', 'rccseatfrontleft', 'heated2'),
    car('button', 'hafdefault', 'unknown'),
    entity('sensor.charger_status', 'Charging'),
    entity('number.charger_max_current', '32', {min: 6, max: 40}),
    entity('switch.charger_pause', 'on'),
    entity('lock.charger_lock', 'unlocked'),
  ];
  const byId = new Map(states.map(state => [state.entity_id, state]));
  for (const [id, replacement] of Object.entries(over)) {
    if (replacement) byId.set(id, replacement);
    else byId.delete(id);
  }
  return houseOf([], [...byId.values()]);
}
const id = (domain: string, key: string) => `${domain}.${PREFIX}_${key}`;

const inputsOf = (hass: FakeHass, config: object = FULL_CFG) => {
  const store = storeOf(hass, config);
  return readCarFeature(hass.states, store.config, store.names);
};
const depsFor = (hass: FakeHass, language: Language = 'en', held: Record<string, unknown> = {}): ControlsDeps => ({
  ...depsOf(hass, language),
  overlay: <T>(key: string, current: T): T => (key in held ? (held[key] as T) : current),
});
describe('the charger’s card, from the test house', () => {
  const view = chargerControls(inputsOf(fullHouse), depsFor(fullHouse))!;

  test('says what the charger is and does, and offers its lock; the pause is the actions row’s', () => {
    expect(view).toMatchObject({title: 'Home charger', line: 'Wallbox Pulsar Plus · charging', available: true});
    expect(view.lock).toEqual({
      id: 'lock.charger_lock',
      title: 'Lock charger',
      line: 'Unlocked, anyone can plug in',
      on: false,
      disabled: false,
      label: 'Lock charger',
    });
    expect(view).not.toHaveProperty('charging');
    expect(view).not.toHaveProperty('limit');
  });

  test('offers the steps the charger’s own range holds, each with its kilowatts, and chooses the one it is at', () => {
    expect(view.power).toMatchObject({
      heading: 'Power limit',
      label: 'Charging current limit',
      id: 'number.charger_max_current',
      chosen: '32',
      disabled: false,
      hint: 'kW at 240 V.',
    });
    // the range is 6 to 40: 48 is not offered
    expect(view.power.options).toEqual([
      {value: '16', label: '16 A', sub: '3.8\u00a0kW'},
      {value: '24', label: '24 A', sub: '5.8\u00a0kW'},
      {value: '32', label: '32 A', sub: '7.7\u00a0kW'},
      {value: '40', label: '40 A', sub: '9.6\u00a0kW'},
    ]);
  });
});

describe('the charger’s card, from literal houses', () => {
  test('is nothing while the house has no car', () => {
    const hass = houseOf([], [entity('sensor.charger_status', 'Charging')]);
    expect(chargerControls(inputsOf(hass), depsFor(hass))).toBeNull();
  });

  test('a held value stands for the entity’s own while it is held: the current and the lock', () => {
    const hass = carHouse();
    const held = {[K.amps('number.charger_max_current')]: 24, [K.chargerLock('lock.charger_lock')]: true};
    const view = chargerControls(inputsOf(hass), depsFor(hass, 'en', held))!;
    expect(view.power.chosen).toBe('24');
    expect(view.lock).toMatchObject({on: true, line: 'Locked, needs the app or RFID card'});
  });

  test('a current outside the steps chooses none of them and says what it is now', () => {
    const hass = carHouse({
      'number.charger_max_current': entity('number.charger_max_current', '20.4', {min: 6, max: 48}),
    });
    const view = chargerControls(inputsOf(hass), depsFor(hass))!;
    expect(view.power.chosen).toBe('20');
    expect(view.power.hint).toBe('Now 20 A · kW at 240 V.');
    expect(view.power.options.at(-1)).toEqual({value: '48', label: '48 A', sub: '12\u00a0kW'});
  });

  test('a charger that does not answer is unavailable: one line instead of controls that cannot be used', () => {
    const hass = carHouse({
      'sensor.charger_status': {
        ...entity('sensor.charger_status', 'unavailable'),
        last_changed: '2026-11-07T18:38:00+00:00',
      },
      'number.charger_max_current': entity('number.charger_max_current', 'unavailable'),
      'switch.charger_pause': entity('switch.charger_pause', 'unavailable'),
      'lock.charger_lock': entity('lock.charger_lock', 'unavailable'),
    });
    const view = chargerControls(inputsOf(hass), depsFor(hass))!;
    expect(view).toMatchObject({
      available: false,
      unavailable: {
        title: 'Wallbox unavailable',
        line: 'Not answering since Nov 7 at 1:38 pm. Its controls come back when it answers.',
      },
    });
    expect(chargerControls(inputsOf(hass), depsFor(hass, 'fr'))?.unavailable.line).toBe(
      'Ne répond plus depuis le 7 nov. à 13 h 38. Ses commandes reviennent dès qu’elle répond.',
    );
  });

  test('a house that names no charger entity has none to ask: unavailable, the card still there', () => {
    const hass = carHouse({
      'sensor.charger_status': null,
      'number.charger_max_current': null,
      'switch.charger_pause': null,
      'lock.charger_lock': null,
    });
    const view = chargerControls(inputsOf(hass, {}), depsFor(hass))!;
    expect(view.available).toBe(false);
    expect(view.line).toBe('Wallbox Pulsar Plus · unavailable');
    // no status sensor, so no time it stopped answering
    expect(view.unavailable.line).toBe('Its controls come back when it answers.');
  });

  test('the line says the status in lower case, the car’s plug, and a status it does not know as the sensor says it', () => {
    const unplugged = carHouse({
      [id('sensor', 'elvehplug')]: car('sensor', 'elvehplug', 'DISCONNECTED'),
      'sensor.charger_status': entity('sensor.charger_status', 'Ready'),
    });
    expect(chargerControls(inputsOf(unplugged), depsFor(unplugged))?.line).toBe(
      'Wallbox Pulsar Plus · ready, car not plugged in',
    );
    const odd = carHouse({'sensor.charger_status': entity('sensor.charger_status', 'Standing By')});
    expect(chargerControls(inputsOf(odd), depsFor(odd))?.line).toBe('Wallbox Pulsar Plus · standing by');
  });

  test('in French the words are French’s and the kilowatts take a comma', () => {
    const view = chargerControls(inputsOf(fullHouse), depsFor(fullHouse, 'fr'))!;
    expect(view).toMatchObject({title: 'Borne à la maison', line: 'Wallbox Pulsar Plus · en recharge'});
    expect(view.power.options[0]).toEqual({value: '16', label: '16 A', sub: '3,8\u00a0kW'});
    expect(view.power.hint).toBe('kW à 240 V.');
  });
});

describe('the departure row and its editor', () => {
  const hass = carHouse();
  const saved = draftFromSchedule(inputsOf(hass).car!.schedule);
  const view = departureControls(inputsOf(hass), saved, depsFor(hass))!;

  test('the row says what Ford saved and whether it is on, and only opens the editor; the switch is the editor’s first row', () => {
    expect(view.row).toEqual({title: 'Departure', line: 'Weekdays at 8:30 am · On'});
    expect(view.editor.departure).toEqual({
      id: id('switch', 'departuretimes'),
      label: 'Departure times',
      on: true,
      disabled: false,
    });
  });

  test('the editor: Cancel and Save, the time, the cabin to choose, and the seven days as a checkmark list', () => {
    expect(view.editor).toMatchObject({
      title: 'Departure',
      cancel: 'Cancel',
      save: 'Save',
      time: {label: 'Time', value: '08:30', shown: '8:30 am'},
      live: true,
      cabin: {label: 'Cabin', chosen: undefined, choose: 'Choose', shown: 'Choose'},
      repeat: 'Repeat',
      foot: "Ford doesn't report the cabin setting of a saved schedule.",
    });
    expect(view.editor.cabin.options.map(({label}) => label)).toEqual(['Cool', 'Medium', 'Warm', 'Off']);
    expect(view.editor.days[0]).toEqual({day: 'monday', name: 'Every Monday', checked: true});
    expect(view.editor.days.map(({checked}) => checked)).toEqual([true, true, true, true, true, false, false]);
  });

  test('Save waits for what is missing and says what it is: the cabin first, then a day', () => {
    expect(view.editor).toMatchObject({canSave: false, reason: 'Pick a cabin temperature first'});
    const noDays = departureControls(inputsOf(hass), {...saved, temp: 'high', days: []}, depsFor(hass))!;
    expect(noDays.editor).toMatchObject({canSave: false, reason: 'Pick at least one day'});
    const ready = departureControls(inputsOf(hass), {...saved, temp: 'high'}, depsFor(hass))!;
    expect(ready.editor).toMatchObject({canSave: true, reason: '', cabin: {chosen: 'high', shown: 'Warm'}});
  });

  test('with no schedule saved the row says so, not the editor’s default time', () => {
    const none = carHouse({[id('sensor', 'departureschedules')]: null});
    expect(departureControls(inputsOf(none), draftFromSchedule(null), depsFor(none))?.row.line).toBe(
      'No times saved · On',
    );
    expect(departureControls(inputsOf(none), draftFromSchedule(null), depsFor(none, 'fr'))?.row.line).toBe(
      'Aucun horaire enregistré · Activé',
    );
  });

  test('a car with no departure switch has the row disabled and off; a house with no car has none', () => {
    const none = carHouse({[id('switch', 'departuretimes')]: null});
    const view = departureControls(inputsOf(none), saved, depsFor(none))!;
    expect(view.editor.departure).toMatchObject({on: false, disabled: true});
    expect(view.row.line).toBe('Weekdays at 8:30 am · Off');
    // a car with no switch has none that is off: its rows stay live, and the time reads in the house's format
    expect(view.editor).toMatchObject({live: true, time: {shown: '8:30 am'}});
    // with the switch there and off the rows below are not live (the sheet dims them)
    const off = carHouse({[id('switch', 'departuretimes')]: car('switch', 'departuretimes', 'off')});
    expect(departureControls(inputsOf(off), saved, depsFor(off))!.editor.live).toBe(false);
    expect(departureControls(inputsOf(houseOf([], [])), saved, depsFor(houseOf([], [])))).toBeNull();
  });

  test('in French', () => {
    const fr = departureControls(inputsOf(hass), saved, depsFor(hass, 'fr'))!;
    expect(fr.row.title).toBe('Départ');
    expect(fr.editor.days[0].name).toBe('Chaque lundi');
    expect(fr.editor.time.shown).toBe('8 h 30');
    expect(fr.editor).toMatchObject({cancel: 'Annuler', save: 'Enregistrer', repeat: 'Répéter'});
  });
});

describe('the actions row, from a car with every switch', () => {
  const hass = carHouse({'sensor.charger_power': entity('sensor.charger_power', '7.2')});
  const view = carActions(inputsOf(hass), depsFor(hass));

  test('Unlock says the car is locked now and asks first; Start says the engine is off and asks first; Pause charging says the power', () => {
    expect(view?.lock).toEqual({
      label: 'Unlock',
      line: 'Locked now',
      locked: true,
      confirm: {title: 'Unlock the car?', line: 'Anyone at the car can open it.', confirm: 'Unlock', cancel: 'Cancel'},
    });
    expect(view?.start).toMatchObject({label: 'Start…', line: 'Engine off', running: false});
    expect(view?.pause).toEqual({
      id: 'switch.charger_pause',
      label: 'Pause charging',
      line: '7.2\u00a0kW',
      paused: false,
    });
  });
});

describe('the actions row, from literal houses', () => {
  test('a car with no remote start has no Start; a charger whose pause switch is gone has no Pause; a house with no car has no row', () => {
    const hass = carHouse({[id('switch', 'ignition')]: null, 'switch.charger_pause': null});
    const view = carActions(inputsOf(hass), depsFor(hass));
    expect(view?.start).toBeNull();
    expect(view?.pause).toBeNull();
    expect(view?.lock?.label).toBe('Unlock');
    expect(carActions(inputsOf(houseOf([], [])), depsFor(houseOf([], [])))).toBeNull();
  });

  test('a charger that answers but draws nothing says no power under Pause charging, rather than 0.0\u00a0kW', () => {
    const hass = carHouse({'sensor.charger_power': entity('sensor.charger_power', '0')});
    expect(carActions(inputsOf(hass), depsFor(hass))?.pause).toMatchObject({label: 'Pause charging', line: ''});
  });

  test('a lock the car does not answer for is not offered: the row shows only what the house can do', () => {
    const hass = carHouse({[id('lock', 'doorlock')]: entity(id('lock', 'doorlock'), 'unavailable')});
    expect(carActions(inputsOf(hass), depsFor(hass))?.lock).toBeNull();
  });

  test('Honk & flash is the car’s first button that answers, and none when the car has none', () => {
    const hass = carHouse();
    expect(carActions(inputsOf(hass), depsFor(hass))?.honk).toEqual({
      id: id('button', 'hafdefault'),
      label: 'Honk & flash',
    });
    const none = carHouse({[id('button', 'hafdefault')]: null});
    expect(carActions(inputsOf(none), depsFor(none))?.honk).toBeNull();
  });

  test('a held tap shows at once: the car unlocked asks nothing to lock, the engine running offers Stop, the charger paused offers Resume', () => {
    const hass = carHouse();
    const view = carActions(
      inputsOf(hass),
      depsFor(hass, 'en', {
        [K.doorLock(id('lock', 'doorlock'))]: false,
        [K.ignition(id('switch', 'ignition'))]: true,
        [pauseHold('switch.charger_pause')]: false,
      }),
    );
    expect(view?.lock).toMatchObject({label: 'Lock', line: 'Unlocked now', locked: false, confirm: null});
    expect(view?.start).toMatchObject({label: 'Stop engine', line: 'Running', running: true});
    expect(view?.pause).toMatchObject({label: 'Resume charging', line: 'Paused', paused: true});
  });

  test('in French', () => {
    const hass = carHouse({'sensor.charger_power': entity('sensor.charger_power', '7.2')});
    const view = carActions(inputsOf(hass), depsFor(hass, 'fr'));
    expect(view?.lock).toMatchObject({
      label: 'Déverrouiller',
      line: 'Verrouillée',
      confirm: {title: 'Déverrouiller la voiture ?', cancel: 'Annuler'},
    });
    expect(view?.start?.label).toBe('Démarrer…');
    expect(view?.pause).toMatchObject({label: 'Suspendre la recharge', line: '7,2\u00a0kW'});
  });
});

describe('the Start confirmation', () => {
  test('the seats’ line says cooling at its level, and nothing for a state it does not know', () => {
    const cooled = carHouse({[id('select', 'rccseatfrontleft')]: car('select', 'rccseatfrontleft', 'cooled1')});
    expect(carActions(inputsOf(cooled), depsFor(cooled))?.start?.seats).toBe(
      'Front seats cool at level 1 with remote start.',
    );
    const off = carHouse({[id('select', 'rccseatfrontleft')]: car('select', 'rccseatfrontleft', 'off')});
    expect(carActions(inputsOf(off), depsFor(off))?.start?.seats).toBe('');
  });

  test('asks first, says what follows, and offers the heaters the car has as switches, with the seats’ own setting', () => {
    const hass = carHouse();
    const start = carActions(inputsOf(hass), depsFor(hass))?.start;
    expect(start?.confirm).toEqual({
      title: 'Start the car?',
      line: 'The engine runs 15 minutes to warm or cool the cabin, then stops.',
      confirm: 'Start',
      cancel: 'Cancel',
    });
    expect(start?.options).toEqual([
      {key: 'windshield', name: 'Heated windshield', on: true},
      {key: 'rear', name: 'Rear defrost', on: false},
      {key: 'wheel', name: 'Heated wheel', on: false},
    ]);
    expect(start?.seats).toBe('Front seats heat at level 2 with remote start.');
  });

  test('the heaters say they run with every start and are saved to the car as they are switched, so Cancel is not their undo', () => {
    const hass = carHouse();
    expect(carActions(inputsOf(hass), depsFor(hass))?.start).toMatchObject({
      optionsLabel: 'Runs with every start',
      optionsFoot: 'Saved to the car as you switch them, whether or not you start now.',
    });
    expect(carActions(inputsOf(hass), depsFor(hass, 'fr'))?.start).toMatchObject({
      optionsLabel: 'Avec chaque démarrage',
      optionsFoot: 'Enregistré dans la voiture dès que vous les basculez, que vous démarriez maintenant ou non.',
    });
  });

  test('a heater the car does not have is left out, and a held one shows at once', () => {
    const hass = carHouse({[id('switch', 'rccsteeringwheel')]: null});
    const start = carActions(
      inputsOf(hass),
      depsFor(hass, 'en', {[K.heater(id('switch', 'rccdefrostrear'))]: true}),
    )?.start;
    expect(start?.options.map(({key, on}) => [key, on])).toEqual([
      ['windshield', true],
      ['rear', true],
    ]);
  });
});
