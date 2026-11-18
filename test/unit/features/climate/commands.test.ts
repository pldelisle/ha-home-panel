// The Climate commands as data, and the arithmetic of a setpoint's next step: the expected objects are literals, so a renamed service, key or toast is a failing test.
import {describe, expect, test} from 'vitest';
import {
  ALL_ROOMS,
  clampSetpoint,
  hpFan,
  hpMode,
  hpPreset,
  hpSwing,
  hpSwingHorizontal,
  hpSwingVertical,
  hpTemperature,
  nextSetpoint,
  quickSetpoint,
  setAllRooms,
  setRoomTemperature,
} from '../../../../src/features/climate/commands.ts';

// what a command needs of the formatters: a number to its decimals; the French writes a comma, which a test of the catalog covers
const fmt = {fixed: (n: number, digits: number) => n.toFixed(digits)};
const room = {id: 'climate.den', name: 'Den'};
const pump = {id: 'climate.pump'};

describe('nextSetpoint', () => {
  test.each([
    // a step is half a degree, from the setpoint it starts at
    [21, 0.5, 21.5],
    [21, -0.5, 20.5],
    [21.3, 0.5, 22],
    // below 5.5 going down is the lowest setpoint, the thermostat off: from 6 down is 5.5, which is not below it
    [6, -0.5, 5.5],
    [5.5, -0.5, 5],
    [5, -0.5, 5],
    // up from off is 15, not 5.5 or 6
    [5, 0.5, 15],
    [5.5, 0.5, 15],
    [6, 0.5, 6.5],
  ])('%d and a step of %d is %d', (current, delta, next) => {
    expect(nextSetpoint(current, delta, 5, 30)).toBe(next);
  });

  test('stays inside the thermostat’s own range, whatever the rules say', () => {
    expect(nextSetpoint(30, 0.5, 5, 30)).toBe(30);
    expect(nextSetpoint(5, 0.5, 5, 12)).toBe(12);
    // a thermostat that goes no lower than 7 has no frost guard to step down to: the step down from 7.5 is its lowest
    expect(nextSetpoint(7.5, -0.5, 7, 28)).toBe(7);
    expect(nextSetpoint(7, -0.5, 7, 28)).toBe(7);
    expect(nextSetpoint(28, 0.5, 7, 28)).toBe(28);
  });
});

describe('clampSetpoint and quickSetpoint', () => {
  test('a setpoint goes to the half degree and stays in the range', () => {
    expect(clampSetpoint(21.2, 5, 30)).toBe(21);
    expect(clampSetpoint(21.3, 5, 30)).toBe(21.5);
    expect(clampSetpoint(40, 5, 30)).toBe(30);
    expect(clampSetpoint(2, 5, 30)).toBe(5);
  });

  test('a quick button is its degrees, and Off is the frost guard, kept in the thermostat’s own range', () => {
    expect(quickSetpoint(20, 5, 30)).toBe(20);
    expect(quickSetpoint('off', 5, 30)).toBe(5);
    expect(quickSetpoint('off', 7, 30)).toBe(7);
    expect(quickSetpoint(22, 5, 21)).toBe(21);
  });
});

describe('the "set every room" stepper', () => {
  test('starts at 21 and goes from 5.5, the lowest that is not off, to 30', () => {
    expect(ALL_ROOMS).toEqual({start: 21, lo: 5.5, hi: 30});
  });
});

describe('setRoomTemperature', () => {
  test('sets one thermostat, holds its setpoint and says the room and the value', () => {
    expect(setRoomTemperature(room, 21.5, fmt)).toEqual({
      domain: 'climate',
      service: 'set_temperature',
      data: {entity_id: 'climate.den', temperature: 21.5},
      holds: ['climate.den:sp'],
      done: {key: 'climate.roomSet', values: {name: 'Den', n: '21.5'}},
    });
  });

  test('says one decimal, whole degrees included', () => {
    expect(setRoomTemperature(room, 21, fmt).done).toEqual({key: 'climate.roomSet', values: {name: 'Den', n: '21.0'}});
  });

  test('at or below 5.5 says the room is off, and still sends the value', () => {
    for (const value of [5, 5.5]) {
      const command = setRoomTemperature(room, value, fmt);
      expect(command.data).toEqual({entity_id: 'climate.den', temperature: value});
      expect(command.done).toEqual({key: 'climate.roomOff', values: {name: 'Den'}});
    }
  });
});

describe('setAllRooms', () => {
  const ids = ['climate.den', 'climate.hall'];

  test('is one call with every thermostat, each of them held at the value', () => {
    expect(setAllRooms(ids, 19.5, fmt)).toEqual({
      domain: 'climate',
      service: 'set_temperature',
      data: {entity_id: ['climate.den', 'climate.hall'], temperature: 19.5},
      holds: ['climate.den:sp', 'climate.hall:sp'],
      done: {key: 'climate.allRoomsSet', values: {n: '19.5'}},
    });
  });

  test('at the frost guard says every room is off', () => {
    expect(setAllRooms(ids, 5, fmt)).toMatchObject({
      data: {entity_id: ids, temperature: 5},
      done: {key: 'climate.allRoomsOff'},
    });
  });

  test('copies the ids, so a list the caller changes later does not change what was sent', () => {
    const asked = [...ids];
    const command = setAllRooms(asked, 20, fmt);
    asked.push('climate.attic');
    expect(command.data).toEqual({entity_id: ids, temperature: 20});
  });
});

describe('the heat pump', () => {
  test('hpMode sets the mode, holds it and says it in lower case', () => {
    expect(hpMode(pump, 'heat_cool', 'Auto')).toEqual({
      domain: 'climate',
      service: 'set_hvac_mode',
      data: {entity_id: 'climate.pump', hvac_mode: 'heat_cool'},
      holds: ['climate.pump:hp-mode'],
      done: {key: 'climate.hpMode', values: {mode: 'auto'}},
    });
  });

  test('hpTemperature sets the target, holds it and says it with one decimal', () => {
    expect(hpTemperature(pump, 22.5, fmt)).toEqual({
      domain: 'climate',
      service: 'set_temperature',
      data: {entity_id: 'climate.pump', temperature: 22.5},
      holds: ['climate.pump:hp-sp'],
      done: {key: 'climate.hpSet', values: {n: '22.5'}},
    });
  });

  test('hpFan sets the fan mode and says its word', () => {
    expect(hpFan(pump, 'quiet', 'Quiet')).toEqual({
      domain: 'climate',
      service: 'set_fan_mode',
      data: {entity_id: 'climate.pump', fan_mode: 'quiet'},
      holds: ['climate.pump:hp-fan'],
      done: {key: 'climate.hpFan', values: {fan: 'quiet'}},
    });
  });

  test('hpPreset sets the preset and says its word: none is Normal', () => {
    expect(hpPreset(pump, 'none', 'Normal')).toEqual({
      domain: 'climate',
      service: 'set_preset_mode',
      data: {entity_id: 'climate.pump', preset_mode: 'none'},
      holds: ['climate.pump:hp-preset'],
      done: {key: 'climate.hpPreset', values: {preset: 'normal'}},
    });
  });

  test('hpSwing sets the louvers and says where they are', () => {
    expect(hpSwing(pump, 'vertical_3', 'Fixed, vertical position 3')).toEqual({
      domain: 'climate',
      service: 'set_swing_mode',
      data: {entity_id: 'climate.pump', swing_mode: 'vertical_3'},
      holds: ['climate.pump:hp-swing'],
      done: {key: 'climate.hpSwing', values: {swing: 'fixed, vertical position 3'}},
    });
  });

  test('with the directions apart: up and down is the same call, its toast names it; side to side is its own service', () => {
    expect(hpSwingVertical(pump, 'Vertical_7', 'Position 7')).toEqual({
      domain: 'climate',
      service: 'set_swing_mode',
      data: {entity_id: 'climate.pump', swing_mode: 'Vertical_7'},
      holds: ['climate.pump:hp-swing'],
      done: {key: 'climate.hpSwingVertical', values: {swing: 'position 7'}},
    });
    expect(hpSwingHorizontal(pump, 'Horizontal_3', 'Position 3')).toEqual({
      domain: 'climate',
      service: 'set_swing_horizontal_mode',
      data: {entity_id: 'climate.pump', swing_horizontal_mode: 'Horizontal_3'},
      holds: ['climate.pump:hp-swing-h'],
      done: {key: 'climate.hpSwingHorizontal', values: {swing: 'position 3'}},
    });
  });
});
