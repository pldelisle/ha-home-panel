// The icons of src/ui/icons.ts: `ico` draws one at the size asked. The legacy class's own icon table, which each path was checked
// against while the class drew it, went with its last reader, the Home tiles (#268), and the class itself with the guest (#277).
import {describe, expect, test} from 'vitest';
import {ICONS, conditionKind, ico, weatherIcon} from '../../src/ui/icons.ts';

describe('the icons', () => {
  test('ico draws an svg of the size asked, and 20 pixels by default', () => {
    expect(ico('menu', 24).values[0]).toBe(24);
    expect(ico('menu').values).toEqual([20, 20, ICONS.menu]);
  });

  test('the Ask button has its own icon, a speech bubble with a question mark', () => {
    expect(ico('ask', 20).values).toEqual([20, 20, ICONS.ask]);
    expect(ICONS.ask).not.toBe(ICONS.more);
  });
});

describe('the weather icons', () => {
  test.each([
    ['sunny', 'clear'],
    ['partlycloudy', 'part'],
    ['pouring', 'rain'],
    ['snowy-rainy', 'sleet'],
    ['lightning-rainy', 'storm'],
    ['windy-variant', 'wind'],
    // an integration's own words
    ['Thunderstorm with light rain', 'storm'],
    ['Light Rain and Snow', 'sleet'],
    ['Flurries', 'snow'],
    ['Rain Showers', 'rain'],
    ['Ice Fog', 'snow'], // `ice|hail` is tried before `fog`, as the class's table did
    ['Fog Patches', 'fog'],
    ['Haze', 'fog'],
    ['Strong wind', 'wind'],
    ['Mainly Sunny', 'part'],
    ['Overcast', 'cloud'],
    ['Clear', 'clear'],
    ['Volcanic ash', 'cloud'],
    [null, 'cloud'],
  ] as const)('%s is drawn as %s', (condition, kind) => {
    expect(conditionKind(condition)).toBe(kind);
  });

  test.each(['sunny', 'partlycloudy', 'cloudy', 'rainy', 'snowy', 'snowy-rainy', 'lightning', 'fog', 'windy'])(
    '%s has a glyph by day and by night',
    condition => {
      for (const day of [true, false]) expect(weatherIcon(condition, 24, day).values[3]).toBeDefined();
    },
  );

  test('weatherIcon draws the size, the sun or the moon, and the name asked for', () => {
    const [width, height, label] = weatherIcon('sunny', 76, false, 'Sunny').values;
    expect([width, height, label]).toEqual([76, 76, 'Sunny']);
    expect(weatherIcon('sunny').values.slice(0, 2)).toEqual([28, 28]);
    // the moon, where the sun was
    expect(JSON.stringify(weatherIcon('sunny', 28, false).values)).not.toEqual(
      JSON.stringify(weatherIcon('sunny').values),
    );
  });
});
