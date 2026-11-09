// The browser's locale defaults, read from the Node this test runs in, which has the same `Intl` the browser does.
import {expect, test} from 'vitest';
import {browserDefaults} from '../../src/core/i18n/browser.ts';

test('the zone, locale and hour cycle are what Intl resolves here', () => {
  const resolved = new Intl.DateTimeFormat(undefined, {hour: 'numeric'}).resolvedOptions();
  const defaults = browserDefaults();
  expect(defaults.timeZone).toBe(resolved.timeZone);
  expect(defaults.timeZone).toBeTruthy();
  expect(defaults.browserLocale).toBe(resolved.locale);
  expect(typeof defaults.browserHour12).toBe('boolean');
});
