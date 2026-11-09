// The locale derivation: a Home Assistant profile (language, country, time zone, 12/24-hour and number formats) to the
// spec `Intl` is given. Pattern: a pure function at the hass seam that maps the profile as Home Assistant's own
// formatTime and formatNumber do, over Unicode CLDR data through `Intl`. Deliberate override of CLDR and `Intl`: a
// missing country is CA (today's behaviour) and the house rules of format.ts follow the tag chosen here.
// Must not: read navigator, the clock or an `Intl` default (the shell passes the browser's in), or touch the DOM.
import type {PanelHass} from '../hass.ts';

/** What the formatters are built from: everything `Intl` needs and nothing it would have to look up. */
export interface PanelLocaleSpec {
  /** The bare language (`fr`), which picks the catalog and the name column. */
  language: string;
  /** The BCP-47 tag `Intl` is given (`fr-CA`). */
  tag: string;
  timeZone: string;
  /** True for 12 hours, false for 24, undefined to let the tag decide. */
  hour12?: boolean;
  /** The locale `Intl.NumberFormat` is given, which the number_format preference may set apart from the tag. */
  numberLocale: string;
  useGrouping: boolean;
}

/** The browser's defaults, which the core may not read itself: the shell passes them in. */
export interface LocaleDefaults {
  timeZone: string;
  browserLocale: string;
  browserHour12?: boolean;
}

export function panelLocale(hass: PanelHass, defaults: LocaleDefaults): PanelLocaleSpec {
  const lang = hass.locale?.language ?? hass.language ?? 'en';
  // the region matters: plain `fr` gives 16:07 where `fr-CA` gives 16 h 07
  const tag = lang.includes('-') ? lang : `${lang}-${hass.config.country ?? 'CA'}`;
  const timeFormat = hass.locale?.time_format;
  const numberFormat = hass.locale?.number_format;
  return {
    language: lang.split('-')[0],
    tag,
    timeZone: hass.config.time_zone || defaults.timeZone,
    hour12: hour12(timeFormat, defaults.browserHour12),
    numberLocale: numberLocale(numberFormat, tag, defaults.browserLocale),
    useGrouping: numberFormat !== 'none',
  };
}

/** Home Assistant's formatTime mapping; `language` and anything unknown leave the tag to decide. */
function hour12(timeFormat: string | undefined, browserHour12: boolean | undefined): boolean | undefined {
  switch (timeFormat) {
    case '12':
      return true;
    case '24':
      return false;
    case 'system':
      return browserHour12;
    default:
      return undefined;
  }
}

/** Home Assistant's formatNumber mapping; `language`, `none` and anything unknown follow the tag. */
function numberLocale(numberFormat: string | undefined, tag: string, browserLocale: string): string {
  switch (numberFormat) {
    case 'comma_decimal':
      return 'en-US';
    case 'decimal_comma':
      return 'de';
    case 'space_comma':
      return 'fr';
    case 'system':
      return browserLocale;
    default:
      return tag;
  }
}
