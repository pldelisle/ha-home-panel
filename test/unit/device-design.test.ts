// The design a device starts in, from what its browser says about itself: Apple's devices take Liquid Glass, Android takes Material.
import {describe, expect, test} from 'vitest';
import {deviceDesign} from '../../src/core/device-design.ts';

// user agents as each browser sends them (versions trimmed, never matched on)
const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  // iPadOS asks for desktop sites, so its Safari says Macintosh
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  haIos:
    'Mozilla/5.0 (iPad; CPU OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2026.11.0',
  android:
    'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  haAndroid:
    'Mozilla/5.0 (Linux; Android 16; SM-X710; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Safari/537.36 Home Assistant/2026.11.0-full',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36',
};

describe('the user agent decides when the browser gives no platform', () => {
  test.each([
    ['an iPhone', UA.iphone],
    ['an iPad in desktop mode', UA.ipad],
    ['the Home Assistant app on an iPad', UA.haIos],
  ])('%s starts in Liquid Glass', (_, userAgent) => {
    expect(deviceDesign({userAgent})).toBe('apple');
  });

  test.each([
    ['Chrome on an Android phone', UA.android],
    ['the Home Assistant app on an Android tablet', UA.haAndroid],
  ])('%s starts in Material', (_, userAgent) => {
    expect(deviceDesign({userAgent})).toBe('material');
  });

  test.each([
    ['Windows', UA.windows],
    ['Linux (the screenshots)', UA.linux],
  ])('%s keeps the panel default, Liquid Glass', (_, userAgent) => {
    expect(deviceDesign({userAgent})).toBe('apple');
  });
});

test('the platform the browser reports wins over its user agent', () => {
  expect(deviceDesign({userAgent: UA.windows, platform: 'Android'})).toBe('material');
  expect(deviceDesign({userAgent: UA.android, platform: 'macOS'})).toBe('apple');
});

test('a browser that says nothing keeps the panel default', () => {
  expect(deviceDesign({})).toBe('apple');
});
