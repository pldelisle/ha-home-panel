// The sun's times for a place and a local day: rise, set, dawn, dusk and solar noon, and whether an instant is day.
// Pattern: the suncalc formulas (Agafonkin, after Meeus, Astronomical Algorithms), a pure function of a place and a day
// key. Its constant J0 puts every time about a minute after NOAA's tables, and the panel has always drawn these.
// Must not: read the clock or a time zone (the caller names the day), or touch the DOM or `hass`.

/** The sun's times in milliseconds since the epoch; rise, set, dawn and dusk are null where the sun never crosses the angle. */
export interface SunTimes {
  rise: number | null;
  set: number | null;
  /** First light: the sun 6 degrees below the horizon, before sunrise. */
  dawn: number | null;
  /** Last light: the sun 6 degrees below the horizon, after sunset. */
  dusk: number | null;
  /** Solar noon. */
  noon: number;
}

const RAD = Math.PI / 180;
const DAY_MS = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;
const J0 = 0.0009;
const HORIZON = -0.833; // the sun's upper edge on the horizon, refraction included
const FIRST_LIGHT = -6; // civil twilight

/** Sunrise, sunset, dawn, dusk and solar noon for the local day `isoDay` (`YYYY-MM-DD`) at a latitude and longitude in degrees. */
export function sunTimes(latitude: number, longitude: number, isoDay: string): SunTimes {
  const noonGuess = Date.parse(`${isoDay}T12:00:00Z`) - (longitude / 15) * 36e5;
  const d = noonGuess / DAY_MS - 0.5 + J1970 - J2000;
  const lw = RAD * -longitude;
  const phi = RAD * latitude;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const L =
    M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  const declination = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const transit = (x: number) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const julianNoon = transit(ds);
  const toMs = (julian: number) => (julian + 0.5 - J1970) * DAY_MS;
  // the instants before and after noon at which the sun is `degrees` above the horizon
  const crossing = (degrees: number): [number | null, number | null] => {
    const w = Math.acos(
      (Math.sin(degrees * RAD) - Math.sin(phi) * Math.sin(declination)) / (Math.cos(phi) * Math.cos(declination)),
    );
    if (Number.isNaN(w)) return [null, null];
    const julianSet = transit(J0 + (w + lw) / (2 * Math.PI) + n);
    return [toMs(julianNoon - (julianSet - julianNoon)), toMs(julianSet)];
  };
  const [rise, set] = crossing(HORIZON);
  const [dawn, dusk] = crossing(FIRST_LIGHT);
  return {rise, set, dawn, dusk, noon: toMs(julianNoon)};
}

/** Whether the instant `t` is between sunrise and sunset of its own local day `isoDay`; false where the sun does not rise or set. */
export function isDayAt(t: number, latitude: number, longitude: number, isoDay: string): boolean {
  const {rise, set} = sunTimes(latitude, longitude, isoDay);
  return rise !== null && set !== null && t > rise && t < set;
}
