// Colour arithmetic: the blend of two `#rrggbb` colours in OKLab, and a colour temperature as the white it looks like.
// Pattern: pure functions over values (functional core): the blend after Björn Ottosson, "A perceptual color space for image processing" (OKLab, 2020),
// perceptually even so neighbouring cells of a scale join without a grey band (it replaced the legacy `toOk`, `fromOk` and `lin`, #246); `kelvinRGB`
// after Tanner Helland's fit (the legacy panel's copy goes with its sheet, #262). The OKLab conversion is private; `oklabBlend` assumes `#rrggbb` literals.
// Must not: read the DOM or a computed style, or round before the end (the output's bytes are the only rounding).

/** A colour in OKLab: lightness, then the green-red and blue-yellow axes. */
type Oklab = [number, number, number];

/** One sRGB channel (0 to 255) as linear light (0 to 1): the inverse of the display's gamma. */
const linear = (channel: number): number => {
  const unit = channel / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

/** A `#rrggbb` colour (either case) in OKLab. */
function toOklab(hex: string): Oklab {
  const [r, g, b] = [1, 3, 5].map(at => linear(parseInt(hex.slice(at, at + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** One linear channel back to a gamma-encoded byte as two lower-case hex digits, clamped to what a display can show. */
const encode = (channel: number): string =>
  Math.round(
    255 * Math.min(1, Math.max(0, channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055)),
  )
    .toString(16)
    .padStart(2, '0');

/** An OKLab colour as `#rrggbb`, lower case, a channel outside the display's range clamped. */
function fromOklab([lightness, a, b]: Oklab): string {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return (
    '#' +
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
      .map(encode)
      .join('')
  );
}

/** The colour a fraction `f` of the way from `from` to `to` (0 is `from`, 1 is `to`), both `#rrggbb`, blended in OKLab; a fraction past either end extrapolates, clamped to what a display shows. */
export function oklabBlend(from: string, to: string, f: number): string {
  const start = toOklab(from);
  const end = toOklab(to);
  return fromOklab(start.map((value, axis) => value + (end[axis] - value) * f) as Oklab);
}

/**
 * The colour of a black body at `kelvin` as `rgb(r,g,b)`, after Tanner Helland's fit ("How to Convert Temperature (K) to RGB", 2012), clamped to
 * 1,000 to 40,000 K: the warm-to-cool white a bulb's colour temperature is drawn in, on the Lights tiles, the sheet's slider and the strip.
 */
export function kelvinRGB(kelvin: number): string {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const byte = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return `rgb(${byte(r)},${byte(g)},${byte(b)})`;
}
