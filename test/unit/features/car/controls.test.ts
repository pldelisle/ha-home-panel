// The Car's two control cards as strings, numbers and flags: from the test house (a charger at 32 A of 6 to 40, charging, unlocked, and a locked car with no comfort sensors), from literal houses for
// every shape it does not show (a car with all its switches, held values, a second tap waiting, a current outside the steps, a charger that is gone), in English and in French.
import {describe, expect, test} from 'vitest';
import {
  chargerControls,
  comfortControls,
  type ArmedKey,
  type ControlsDeps,
} from '../../../../src/features/car/controls.ts';
import {readCarFeature} from '../../../../src/features/car/inputs.ts';
import {K} from '../../../../src/features/car/keys.ts';
import {draftFromSchedule, type ScheduleDraft} from '../../../../src/features/car/schedule.ts';
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
const never = (): boolean => false;
const only =
  (...keys: ArmedKey[]) =>
  (key: ArmedKey): boolean =>
    keys.includes(key);
const draft = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  time: '08:30',
  temp: null,
  ...over,
});

describe('the charger’s card, from the test house', () => {
  const view = chargerControls(inputsOf(fullHouse), depsFor(fullHouse))!;

  test('says what the charger is and does, in the words the legacy card did', () => {
    expect(view).toMatchObject({title: 'Home charger', line: 'Wallbox Pulsar Plus · charging'});
    expect(view.charging).toEqual({
      id: 'switch.charger_pause',
      title: 'Charging',
      line: 'On. Turn off to pause',
      on: true,
      disabled: false,
      label: 'Charging',
    });
    expect(view.lock).toEqual({
      id: 'lock.charger_lock',
      title: 'Lock charger',
      line: 'Unlocked, anyone can plug in',
      on: false,
      disabled: false,
      label: 'Lock charger',
    });
  });

  test('offers the steps the charger’s own range holds, each with its kilowatts, and chooses the one it is at', () => {
    expect(view.power).toMatchObject({
      heading: 'Power limit',
      label: 'Charging current limit',
      id: 'number.charger_max_current',
      chosen: '32',
      disabled: false,
      hint: 'Sets the Wallbox maximum current. kW assumes 240 V.',
    });
    // the range is 6 to 40: 48 is not offered
    expect(view.power.options).toEqual([
      {value: '16', label: '16 A', sub: '3.8 kW'},
      {value: '24', label: '24 A', sub: '5.8 kW'},
      {value: '32', label: '32 A', sub: '7.7 kW'},
      {value: '40', label: '40 A', sub: '9.6 kW'},
    ]);
  });

  test('shows the car’s charge limit, which the panel cannot change', () => {
    expect(view.limit.chosen).toBe('90');
    expect(view.limit.options.map(({label}) => label)).toEqual(['50%', '60%', '70%', '80%', '90%', 'Full']);
    expect(view.limit).toMatchObject({heading: 'Charge limit', label: 'Charge limit, read only'});
    expect(view.limit.hint).toBe('Set in the FordPass app. Home Assistant can read it but has no control for it.');
  });
});

describe('the charger’s card, from literal houses', () => {
  test('is nothing while the house has no car', () => {
    const hass = houseOf([], [entity('sensor.charger_status', 'Charging')]);
    expect(chargerControls(inputsOf(hass), depsFor(hass))).toBeNull();
  });

  test('a held value stands for the entity’s own while it is held: the current, the switch and the lock', () => {
    const hass = carHouse();
    const held = {
      [K.amps('number.charger_max_current')]: 24,
      [pauseHold('switch.charger_pause')]: false,
      [K.chargerLock('lock.charger_lock')]: true,
    };
    const view = chargerControls(inputsOf(hass), depsFor(hass, 'en', held))!;
    expect(view.power.chosen).toBe('24');
    expect(view.charging).toMatchObject({on: false, line: 'Paused. Turn on to resume'});
    expect(view.lock).toMatchObject({on: true, line: 'Locked, needs the app or RFID card'});
  });

  test('a current outside the steps chooses none of them and says what it is now', () => {
    const hass = carHouse({
      'number.charger_max_current': entity('number.charger_max_current', '20.4', {min: 6, max: 48}),
    });
    const view = chargerControls(inputsOf(hass), depsFor(hass))!;
    expect(view.power.chosen).toBe('20');
    expect(view.power.hint).toBe('Sets the Wallbox maximum current (now 20 A). kW assumes 240 V.');
    expect(view.power.options.at(-1)).toEqual({value: '48', label: '48 A', sub: '11.5 kW'});
  });

  test('a current that is not reported is disabled and chooses nothing; a switch that is gone says when it is available', () => {
    const hass = carHouse({
      'number.charger_max_current': entity('number.charger_max_current', 'unavailable'),
      'switch.charger_pause': entity('switch.charger_pause', 'unavailable'),
      'lock.charger_lock': entity('lock.charger_lock', 'unavailable'),
    });
    const view = chargerControls(inputsOf(hass), depsFor(hass))!;
    expect(view.power).toMatchObject({chosen: undefined, disabled: true});
    expect(view.power.hint).toBe('Sets the Wallbox maximum current. kW assumes 240 V.');
    expect(view.charging).toMatchObject({on: false, disabled: true, line: 'Available while the car is plugged in'});
    expect(view.lock).toMatchObject({on: false, disabled: true});
  });

  test('a house that names no charger entity has none to ask: no ids, the controls disabled, the card still there', () => {
    const hass = carHouse({
      'sensor.charger_status': null,
      'number.charger_max_current': null,
      'switch.charger_pause': null,
      'lock.charger_lock': null,
    });
    const view = chargerControls(inputsOf(hass, {}), depsFor(hass))!;
    expect([view.power.id, view.charging.id, view.lock.id]).toEqual([null, null, null]);
    expect(view.power).toMatchObject({disabled: true, chosen: undefined});
    expect(view.charging.disabled).toBe(true);
    expect(view.line).toBe('Wallbox Pulsar Plus · unavailable');
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
    const long = carHouse({
      'sensor.charger_status': entity('sensor.charger_status', 'Connected: waiting for car demand'),
    });
    expect(chargerControls(inputsOf(long), depsFor(long))?.line).toBe(
      'Wallbox Pulsar Plus · connected: waiting for car demand',
    );
  });

  test('a charge limit the car does not report chooses none', () => {
    const hass = carHouse({[id('sensor', 'elvehcharging')]: car('sensor', 'elvehcharging', 'CHARGING')});
    expect(chargerControls(inputsOf(hass), depsFor(hass))?.limit.chosen).toBeUndefined();
  });

  test('in French the words are French’s, the kilowatts take a comma and the limit its narrow space', () => {
    const view = chargerControls(inputsOf(fullHouse), depsFor(fullHouse, 'fr'))!;
    expect(view).toMatchObject({title: 'Borne à la maison', line: 'Wallbox Pulsar Plus · en recharge'});
    expect(view.power.options[0]).toEqual({value: '16', label: '16 A', sub: '3,8 kW'});
    expect(view.limit.options.map(({label}) => label)).toEqual(['50 %', '60 %', '70 %', '80 %', '90 %', 'Pleine']);
    expect(view.charging.line).toBe('En marche. Désactiver pour mettre en pause');
  });
});

describe('the comfort card, from a car with every switch', () => {
  const hass = carHouse();
  const inputs = inputsOf(hass);
  const view = comfortControls(inputs, never, draftFromSchedule(inputs.car!.schedule), depsFor(hass))!;

  test('has the four buttons in order, each as the legacy card said it', () => {
    expect(view).toMatchObject({
      title: 'Comfort and access',
      line: 'Remote start warms or cools the cabin for about 15 minutes',
    });
    expect(
      view.buttons.map(({key, icon, name, text, line, pressed, armed, disabled}) => [
        key,
        icon,
        name,
        text,
        line,
        pressed,
        armed,
        disabled,
      ]),
    ).toEqual([
      ['remoteStart', 'fan', 'Remote start', 'Remote start', 'Off · cabin HI', false, false, false],
      ['windshield', 'wind', 'Heated windshield', 'Heated windshield', 'With remote start: on', true, false, false],
      ['rear', 'rear', 'Rear defrost', 'Rear defrost', 'With remote start: off', false, false, false],
      ['wheel', 'wheel', 'Heated wheel', 'Heated wheel', 'With remote start: off', false, false, false],
    ]);
  });

  test('says how the front seats heat and cool, and nothing for any other setting', () => {
    expect(view.seats).toBe('Front seats heat at level 2 with remote start.');
    const cooled = carHouse({[id('select', 'rccseatfrontleft')]: car('select', 'rccseatfrontleft', 'cooled1')});
    expect(comfortControls(inputsOf(cooled), never, draft(), depsFor(cooled))?.seats).toBe(
      'Front seats cool at level 1 with remote start.',
    );
    const off = carHouse({[id('select', 'rccseatfrontleft')]: car('select', 'rccseatfrontleft', 'off')});
    expect(comfortControls(inputsOf(off), never, draft(), depsFor(off))?.seats).toBe('');
    const none = carHouse({[id('select', 'rccseatfrontleft')]: null, [id('select', 'rcctemperature')]: null});
    const bare = comfortControls(inputsOf(none), never, draft(), depsFor(none))!;
    expect(bare.seats).toBe('');
    expect(bare.buttons[0].line).toBe('Off');
  });

  test('the access row: the lock, the doors and the horn', () => {
    expect(view.access).toEqual({
      title: 'Locked',
      line: 'All doors, windows, hood and tailgate closed',
      honk: {id: id('button', 'hafdefault'), label: 'Honk & flash'},
      lock: {label: 'Unlock', armed: false, disabled: false, locked: true},
    });
  });

  test('a door that is open is named, and a window that is not closed is left out of "closed"', () => {
    const open = carHouse({
      [id('sensor', 'doorstatus')]: car('sensor', 'doorstatus', 'OPEN', {
        driverFront: 'OPEN',
        hood: 'AJAR',
        tailgate: 'CLOSED',
      }),
    });
    expect(comfortControls(inputsOf(open), never, draft(), depsFor(open))?.access.line).toBe('Open: driverFront, hood');
    const windows = carHouse({[id('sensor', 'windowposition')]: car('sensor', 'windowposition', 'Open')});
    expect(comfortControls(inputsOf(windows), never, draft(), depsFor(windows))?.access.line).toBe(
      'All doors, hood and tailgate closed',
    );
    const none = carHouse({[id('sensor', 'doorstatus')]: null});
    expect(comfortControls(inputsOf(none), never, draft(), depsFor(none))?.access.line).toBe('');
  });

  test('an unlocked car says so and offers Lock at once; a lock with no value is unknown and disabled; the horn is the car’s first button that answers', () => {
    const unlocked = carHouse({[id('lock', 'doorlock')]: car('lock', 'doorlock', 'unlocked')});
    expect(comfortControls(inputsOf(unlocked), never, draft(), depsFor(unlocked))?.access).toMatchObject({
      title: 'Unlocked',
      lock: {label: 'Lock', locked: false},
    });
    const unknown = carHouse({
      [id('lock', 'doorlock')]: car('lock', 'doorlock', 'unavailable'),
      [id('button', 'hafdefault')]: null,
      [id('button', 'hafshort')]: car('button', 'hafshort', 'unknown'),
    });
    expect(comfortControls(inputsOf(unknown), never, draft(), depsFor(unknown))?.access).toMatchObject({
      title: 'Lock status unknown',
      honk: {id: id('button', 'hafshort')},
      lock: {label: 'Lock', disabled: true, locked: false},
    });
    const none = carHouse({[id('button', 'hafdefault')]: null});
    expect(comfortControls(inputsOf(none), never, draft(), depsFor(none))?.access.honk).toBeNull();
  });

  test('a button waiting for its second tap says so, and so does the lock; the other is not waiting', () => {
    const waiting = comfortControls(inputs, only('remoteStart'), draft(), depsFor(hass))!;
    expect(waiting.buttons[0]).toMatchObject({text: 'Tap again to start', name: 'Remote start', armed: true});
    expect(waiting.buttons[1].armed).toBe(false);
    expect(waiting.access.lock.armed).toBe(false);
    const lockWaiting = comfortControls(inputs, only('lock'), draft(), depsFor(hass))!;
    expect(lockWaiting.access.lock).toMatchObject({label: 'Tap again to unlock', armed: true});
    expect(lockWaiting.buttons[0].armed).toBe(false);
  });

  test('a held value shows at once: the remote start running, a heater off, the car locked', () => {
    const held = {
      [K.ignition(id('switch', 'ignition'))]: true,
      [K.heater(id('switch', 'rccdefrostfront'))]: false,
      [K.doorLock(id('lock', 'doorlock'))]: false,
    };
    const shown = comfortControls(inputs, never, draft(), depsFor(hass, 'en', held))!;
    expect(shown.buttons[0]).toMatchObject({pressed: true, line: 'Running · cabin HI'});
    expect(shown.buttons[1]).toMatchObject({pressed: false, line: 'With remote start: off'});
    expect(shown.access.lock).toMatchObject({label: 'Lock', locked: false});
  });

  test('a switch the car does not have is disabled', () => {
    const lacking = carHouse({[id('switch', 'rccsteeringwheel')]: null});
    expect(comfortControls(inputsOf(lacking), never, draft(), depsFor(lacking))?.buttons[3].disabled).toBe(true);
  });
});

describe('the departure schedule', () => {
  const hass = carHouse();
  const inputs = inputsOf(hass);

  test('is the switch, the seven days, the time and the four cabin settings, from the draft', () => {
    const view = comfortControls(inputs, never, draft({temp: 'high'}), depsFor(hass))!;
    const {departure} = view;
    expect(departure.heading).toBe('Departure times');
    expect(departure.row).toEqual({
      id: id('switch', 'departuretimes'),
      title: 'Precondition for departure',
      line: 'On · weekdays at 8:30 am',
      on: true,
      disabled: false,
      label: 'Departure times',
    });
    expect(departure.days.map(({day, initial, pressed}) => [day, initial, pressed])).toEqual([
      ['monday', 'M', true],
      ['tuesday', 'T', true],
      ['wednesday', 'W', true],
      ['thursday', 'T', true],
      ['friday', 'F', true],
      ['saturday', 'S', false],
      ['sunday', 'S', false],
    ]);
    expect(departure.days[0].name).toBe('monday');
    expect(departure).toMatchObject({
      daysLabel: 'Departure days',
      timeLabel: 'Departure time',
      time: '08:30',
      save: 'Save schedule',
    });
    expect(departure.cabinLabel).toBe('Cabin temperature at departure');
    expect(departure.cabin).toEqual([
      {value: 'low', label: 'Cool'},
      {value: 'medium', label: 'Medium'},
      {value: 'high', label: 'Warm'},
      {value: 'off', label: 'Off'},
    ]);
    expect(departure.chosen).toBe('high');
    expect(departure.hint).toMatch(/^When the car is plugged in, it warms the cabin/);
  });

  test('chooses no cabin setting until one is picked, and says its line from the draft with a cleared time too', () => {
    const view = comfortControls(inputs, never, draft({days: [], time: ''}), depsFor(hass))!;
    expect(view.departure.chosen).toBeUndefined();
    expect(view.departure.row.line).toBe('On · no days');
  });

  test('a switch that is off says its schedule is saved, and one that is held shows at once', () => {
    const off = carHouse({[id('switch', 'departuretimes')]: car('switch', 'departuretimes', 'off')});
    expect(comfortControls(inputsOf(off), never, draft(), depsFor(off))?.departure.row).toMatchObject({
      on: false,
      line: 'Off · weekdays at 8:30 am saved',
    });
    const held = depsFor(hass, 'en', {[K.departure(id('switch', 'departuretimes'))]: false});
    expect(comfortControls(inputs, never, draft(), held)?.departure.row).toMatchObject({
      on: false,
      line: 'Off · weekdays at 8:30 am saved',
    });
  });

  test('a car with no departure switch has it disabled and off', () => {
    const none = carHouse({[id('switch', 'departuretimes')]: null});
    expect(comfortControls(inputsOf(none), never, draft(), depsFor(none))?.departure.row).toMatchObject({
      on: false,
      disabled: true,
    });
  });

  test('is nothing while the house has no car', () => {
    const bare = houseOf([], [entity('sensor.charger_status', 'Charging')]);
    expect(comfortControls(inputsOf(bare), never, draft(), depsFor(bare))).toBeNull();
  });

  test('in French: the initials are the legacy panel’s LMMJVSD, the time is 8 h 30 and the words are French’s', () => {
    const view = comfortControls(inputs, only('remoteStart'), draft(), depsFor(hass, 'fr'))!;
    expect(view.departure.days.map(({initial}) => initial).join('')).toBe('LMMJVSD');
    expect(view.departure.days[0].name).toBe('lundi');
    expect(view.departure.row.line).toBe('Activé · en semaine à 8 h 30');
    expect(view.title).toBe('Confort et accès');
    expect(view.buttons[0]).toMatchObject({text: 'Toucher de nouveau pour démarrer', line: 'Éteint · habitacle HI'});
    expect(view.departure.cabin.map(({label}) => label)).toEqual(['Frais', 'Moyen', 'Chaud', 'Éteint']);
    expect(view.access.line).toBe('Portes, fenêtres, capot et hayon fermés');
  });
});
