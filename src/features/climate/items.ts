// climateItems: the climate list's items, the house, each room and the heat pump, with their status words, figures and tones.
// Pattern: a pure function at the language seam (ADR 0013), a humble object's other half (Meszaros, Fowler): inputs in, the strings
// the list and the phone's tiles place out, every word through `deps.t`; the legacy `climItems()`'s rules, deleted in #248.
// Must not: import Lit or the DOM, read state or the clock, or hold a word a person reads (a catalog key says it).
import {DASH} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {roomName, type RoomNameDeps} from '../../core/i18n/room-name.ts';
import {FROST_GUARD} from './gauge-geometry.ts';
import type {ClimateInputs} from './inputs.ts';

/** The heat pump's actions the catalog words, by what Home Assistant says; any other action, or a mode standing in for one, is shown as it says it. */
const ACTION_WORDS: ReadonlyMap<string, MessageKey> = new Map([
  ['heating', 'climate.action.heating'],
  ['cooling', 'climate.action.cooling'],
  ['idle', 'climate.action.idle'],
]);

/** `on` for what is heating, `bad` for what is offline or unavailable. */
type Tone = '' | 'on' | 'bad';

export interface ClimateItem {
  /** `house`, `hp`, or the room's key. */
  id: string;
  /** The glyph's name: the room's own, `house` for the whole house, `fan` for the heat pump. */
  icon: string;
  name: string;
  sub: string;
  value: string;
  tone: Tone;
}

/** The words, the figures and the names an item is written with. */
export interface ClimateItemsDeps extends RoomNameDeps {
  fmt: Formatters;
}

/** A temperature to a tenth with its degree sign, the legacy `f1(v) + '°'`; a room with no reading shows `–°` as it did. */
const degrees = (fmt: Formatters, v: number | null): string => `${v === null ? DASH : fmt.fixed(v, 1)}°`;

/** The items in list order: the whole house, each room, then the heat pump when the house has one. */
export function climateItems({rooms, heatPump, heatPumpOn}: ClimateInputs, deps: ClimateItemsDeps): ClimateItem[] {
  const {t, fmt} = deps;
  const temperatures = rooms.flatMap(room => (room.temperature === null ? [] : [room.temperature]));
  const average = temperatures.length ? temperatures.reduce((sum, v) => sum + v, 0) / temperatures.length : null;
  const heating = rooms.filter(room => room.heating).length;
  const items: ClimateItem[] = [
    {
      id: 'house',
      icon: 'house',
      name: t('climate.wholeHouse'),
      sub: t(heatPumpOn ? 'climate.heatPumpPlusRooms' : 'climate.roomsHeating', {n: heating}),
      value: average === null ? DASH : degrees(fmt, average),
      tone: heating || heatPumpOn ? 'on' : '',
    },
    ...rooms.map((room): ClimateItem => ({
      id: room.key,
      icon: room.icon,
      name: roomName(room, deps),
      sub: !room.available
        ? t('climate.unavailable')
        : room.heating
          ? t('climate.heatingKw', {kw: fmt.fixed(room.power ?? 0, 2)})
          : room.setpoint !== null && room.setpoint > FROST_GUARD
            ? t('climate.holding', {n: fmt.number(room.setpoint, 2)})
            : t('climate.off'),
      value: degrees(fmt, room.temperature),
      tone: room.heating ? 'on' : !room.available ? 'bad' : '',
    })),
  ];
  if (heatPump) {
    const brand = heatPump.brand ?? t('climate.heatPump');
    const said = heatPump.action || heatPump.mode;
    const word = ACTION_WORDS.get(said);
    const action = word ? t(word) : said;
    items.push({
      id: 'hp',
      icon: 'fan',
      name: t('climate.heatPump'),
      sub: !heatPump.present
        ? t('climate.notFound')
        : !heatPump.available
          ? t('climate.hpOffline', {brand})
          : heatPump.mode === 'off'
            ? t('climate.hpOff', {brand})
            : heatPump.target === null
              ? t('climate.hpAction', {brand, action})
              : t('climate.hpActionTo', {brand, action, n: fmt.number(heatPump.target, 2)}),
      value: heatPump.available && heatPump.temperature !== null ? degrees(fmt, heatPump.temperature) : DASH,
      tone: !heatPump.available ? 'bad' : heatPumpOn ? 'on' : '',
    });
  }
  return items;
}
