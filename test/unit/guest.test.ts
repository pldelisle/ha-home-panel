// The guest registry (src/shell/guest.ts): nothing is created or adopted before main.js registers a guest, and what it
// registers is what the shell gets. A module with one piece of state; the test order exercises it.
import {expect, test} from 'vitest';
import {createGuest, guestStyles, registerGuest, type GuestRenderer} from '../../src/shell/guest.ts';

const noop = () => {};
const guest = (): GuestRenderer => ({
  connect: noop,
  disconnect: noop,
  hassChanged: noop,
  panelChanged: noop,
  toast: noop,
  tabChanged: noop,
  compactChanged: noop,
  appearanceChanged: noop,
  openMore: noop,
  availability: () => ({}),
  moreLine: () => null,
});

// the registry is module state, so the order of these tests is part of the test: nothing registered, then a guest
test('before a guest is registered, creating one and reading its styles say what to do', () => {
  expect(() => createGuest()).toThrow(/registerGuest\(\) in src\/main\.js/);
  expect(() => guestStyles()).toThrow(/registerGuest\(\) in src\/main\.js/);
});

test('the shell gets a new guest from the registered factory each time, and the registered styles', () => {
  registerGuest(guest, '.app{color:red}');
  const first = createGuest();
  expect(first).toHaveProperty('hassChanged');
  expect(createGuest()).not.toBe(first); // one guest per element, so two panels do not share one
  expect(guestStyles()).toBe('.app{color:red}');
});
