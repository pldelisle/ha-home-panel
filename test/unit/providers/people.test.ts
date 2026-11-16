// presence and frozenPresence: who is home and since when, and which iCloud trackers stopped. The test house's two people give
// today's answer; literal houses give the phone-and-watch rule, the config's order and the three-hour edge. Made-up names only.
import {describe, expect, test} from 'vitest';
import {frozenPresence, presence, presenceIds} from '../../../src/providers/people.ts';
import {registriesOf} from '../../../src/core/registry.ts';
import {entity, type FakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf} from '../features/media/support.ts';

const PEOPLE = ['Alex', 'Sam'];
type State = ReturnType<typeof entity>;
const at = (s: State, changed: string): State => ({...s, last_changed: changed, last_updated: changed});
const read = (hass: FakeHass, people = PEOPLE) => presence(hass.states, registriesOf(hass), people);

describe('the test house', () => {
  test('its person entities say Alex is home and Sam left', () => {
    expect(read(fullHouse)).toEqual([
      {name: 'Alex', home: true, since: null},
      {name: 'Sam', home: false, since: fullHouse.states['person.sam'].last_changed},
    ]);
    expect(presenceIds(fullHouse.states, registriesOf(fullHouse), PEOPLE)).toEqual(['person.alex', 'person.sam']);
  });
});

describe('presence', () => {
  const phone = (id: string, name: string, state: string, changed = '2026-01-01T08:00:00Z') =>
    at(entity(`device_tracker.${id}`, state, {friendly_name: name}), changed);

  test('a person entity wins over the phones, folded on its first word, and an unavailable one counts for no one', () => {
    const hass = houseOf(
      [],
      [
        entity('person.a', 'home', {friendly_name: 'ÉLODIE Example'}),
        entity('person.b', 'unavailable', {friendly_name: 'Sam Example'}),
        phone('sam_iphone', "Sam's iPhone", 'home'),
      ],
    );
    expect(read(hass, ['Sam', 'Elodie'])).toEqual([{name: 'Elodie', home: true, since: null}]);
  });

  test('without a person entity, iPhones and watches decide in both name shapes; an iPad, a hidden tracker or a stranger does not', () => {
    const hass = houseOf(
      [
        ['device_tracker.alex_ipad', 'home', {friendly_name: "Alex's iPad"}],
        ['device_tracker.hidden', 'home', {friendly_name: "Sam's iPhone"}, {hidden: true}],
      ],
      [
        phone('alex_watch', 'Apple Watch de Alex', 'not_home', '2026-01-01T07:00:00Z'),
        phone('alex_phone', 'iPhone d’Alex', 'not_home', '2026-01-01T09:00:00Z'),
        phone('sam_phone', "Sam's iPhone", 'home'),
        phone('sam_watch', "Sam's Watch", 'not_home'),
        phone('jo', "Jo's iPhone", 'home'),
        phone('car', 'Car tracker', 'home'),
        phone('down', "Sam's iPhone 2", 'unknown'),
      ],
    );
    // the config's order, not the states'; away since the last tracker that left
    expect(read(hass, ['Sam', 'Alex'])).toEqual([
      {name: 'Sam', home: true, since: null},
      {name: 'Alex', home: false, since: '2026-01-01T09:00:00Z'},
    ]);
    expect(presenceIds(hass.states, registriesOf(hass), ['Sam', 'Alex']).sort()).toEqual(
      [
        'device_tracker.alex_phone',
        'device_tracker.alex_watch',
        'device_tracker.down',
        'device_tracker.sam_phone',
        'device_tracker.sam_watch',
      ].sort(),
    );
  });

  test('a home tracker keeps its owner home whichever comes first, and no tracker gives no one', () => {
    const hass = houseOf([], [phone('a', "Alex's iPhone", 'home'), phone('b', "Alex's Watch", 'not_home')]);
    expect(read(hass)).toEqual([{name: 'Alex', home: true, since: null}]);
    expect(read(houseOf([], []))).toEqual([]);
  });
});

describe('frozenPresence', () => {
  const NOW = Date.parse('2026-01-01T12:00:00Z');
  const house = (platform = 'icloud', state = 'home') =>
    houseOf(
      [[`device_tracker.p`, state, {}, {platform}]],
      [entity('person.a', 'home', {source: 'device_tracker.p'}), entity('person.b', 'home')],
    );
  const frozen = (hass: FakeHass, updated: string) => {
    const states = {...hass.states, 'device_tracker.p': at(hass.states['device_tracker.p'], updated)};
    return frozenPresence(states, registriesOf(hass), NOW);
  };

  test('an iCloud tracker is frozen from three hours, rounded to the minute', () => {
    // 179.5 minutes rounds to 180, as the legacy stack's `mins` did
    expect(frozen(house(), '2026-01-01T09:00:30Z')).toEqual([
      {id: 'device_tracker.p', updated: '2026-01-01T09:00:30Z'},
    ]);
    expect(frozen(house(), '2026-01-01T09:00:31Z')).toEqual([]);
  });

  test('another platform or an unavailable tracker is never frozen', () => {
    expect(frozen(house('mobile_app'), '2026-01-01T00:00:00Z')).toEqual([]);
    expect(frozen(house('icloud', 'unavailable'), '2026-01-01T00:00:00Z')).toEqual([]);
  });
});
