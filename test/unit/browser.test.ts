// The browser's locale defaults. The zone and the locale come from the process environment, so each case runs a Node of its
// own with the environment pinned, and the expected values are literals.
import {execFileSync} from 'node:child_process';
import {expect, test} from 'vitest';
import {browserDefaults} from '../../src/core/i18n/browser.ts';

/** What `browserDefaults()` returns in a Node started with this zone and locale. */
function defaultsIn(timeZone: string, locale: string) {
  const script = "import('./src/core/i18n/browser.ts').then(m => console.log(JSON.stringify(m.browserDefaults())))";
  const out = execFileSync(process.execPath, ['-e', script], {
    env: {...process.env, TZ: timeZone, LC_ALL: locale, LANG: locale},
    encoding: 'utf8',
  });
  return JSON.parse(out) as unknown;
}

test.each([
  ['Asia/Tokyo', 'fr_CA.UTF-8', {timeZone: 'Asia/Tokyo', browserLocale: 'fr-CA', browserHour12: false}],
  ['America/Toronto', 'en_US.UTF-8', {timeZone: 'America/Toronto', browserLocale: 'en-US', browserHour12: true}],
])('in %s with %s the zone, locale and hour cycle are those of the environment', (timeZone, locale, expected) => {
  expect(defaultsIn(timeZone, locale)).toStrictEqual(expected);
});

test('here, the three defaults are a zone, a locale tag and an hour cycle', () => {
  const defaults = browserDefaults();
  expect(defaults.timeZone).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/);
  expect(defaults.browserLocale).toMatch(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/);
  expect(defaults.browserHour12).toBeTypeOf('boolean');
});
