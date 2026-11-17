// peopleModel: the chips and the Home card's words, in English and French, from the test house's two people and from none.
import {describe, expect, test} from 'vitest';
import {peopleIds, peopleModel} from '../../../../src/features/people/index.ts';
import {presence} from '../../../../src/providers/people.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {depsOf, fullHouse, storeOf} from '../media/support.ts';

const PEOPLE = ['Alex', 'Sam'];
const people = presence(fullHouse.states, registriesOf(fullHouse), PEOPLE);

describe.each([
  ['en', "Who's home", 'home', 'away', 'No one is tracked yet.'],
  ['fr', 'Qui est à la maison', 'à la maison', 'absent', 'No one is tracked yet.'],
] as const)('in %s', (language, label, home, away, hint) => {
  const deps = depsOf(fullHouse, language);

  test('one chip per person, in the config’s order, and no hint', () => {
    expect(peopleModel(people, deps)).toEqual({
      label,
      chips: [
        {name: 'Alex', home: true, state: home},
        {name: 'Sam', home: false, state: away},
      ],
      hint: null,
    });
  });

  test('no one tracked: no chip, and the hint', () => {
    expect(peopleModel([], deps)).toEqual({label, chips: [], hint});
  });
});

test('peopleIds lists the configured people’s entities, and nothing before Home Assistant answers', () => {
  expect(peopleIds(storeOf(fullHouse, {people: PEOPLE}))).toEqual(['person.alex', 'person.sam']);
  expect(peopleIds({hass: null, config: storeOf(fullHouse).config})).toEqual([]);
});
