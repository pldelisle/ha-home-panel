// roomName: the rule of the legacy `roomName()`, in both languages: the config's name, "<Name>'s bedroom" for a Hilo "Chambre de
// <Name>", the thermostat's name without "Thermostat ", else the key; in French the thermostat's own name first. The test house
// gives the dictionary's answer in each language; literal inputs give the rules it does not exercise.
import {describe, expect, test} from 'vitest';
import {roomName, type RoomNameInputs} from '../../../src/core/i18n/room-name.ts';
import {powerNow} from '../../../src/providers/power.ts';
import {fakeHass} from '../fake-hass.ts';
import {fullHouse, storeOf, type Language} from '../features/media/support.ts';

const nameIn = (language: Language, room: Partial<RoomNameInputs>) => {
  const {t, names} = storeOf(fakeHass({locale: {language}}));
  return roomName({key: 'den', configuredName: null, thermostatName: '', ...room}, {names, t, language});
};

describe('the test house', () => {
  test.each([
    ['en', ['Bedroom', 'Garage', 'Living room', 'Office']],
    ['fr', ['Chambre', 'Garage', 'Salon', 'Bureau']],
  ] as const)('its rooms read in %s through the dictionary', (language, expected) => {
    const store = storeOf({...fullHouse, locale: {language}});
    const {rooms} = powerNow(fullHouse.states, store.config);
    expect(rooms.map(room => roomName(room, {names: store.names, t: store.t, language: store.language}))).toEqual(
      expected,
    );
  });
});

describe('in English', () => {
  test('the config’s name wins, then "<Name>’s bedroom", then the thermostat’s name without "Thermostat ", then the key', () => {
    expect(nameIn('en', {configuredName: 'Entry', thermostatName: 'Thermostat Hall'})).toBe('Entry');
    expect(nameIn('en', {thermostatName: 'Thermostat Chambre de Zoé'})).toBe("Zoé's bedroom");
    expect(nameIn('en', {thermostatName: 'Thermostat Hall'})).toBe('Hall');
    expect(nameIn('en', {thermostatName: 'Thermostat'})).toBe('den');
    expect(nameIn('en', {})).toBe('den');
  });
});

describe('in French', () => {
  test('the thermostat’s own name wins, whatever the config calls the room', () => {
    expect(nameIn('fr', {configuredName: 'Entry', thermostatName: 'Thermostat Salle de Séjour'})).toBe(
      'Salle de Séjour',
    );
    expect(nameIn('fr', {thermostatName: 'Chambre de Zoé'})).toBe('Chambre de Zoé');
  });

  test('a thermostat with no name of its own gives the English rule: the config’s name, else the key', () => {
    expect(nameIn('fr', {configuredName: 'Entry', thermostatName: 'Thermostat'})).toBe('Entry');
    expect(nameIn('fr', {})).toBe('den');
  });
});
