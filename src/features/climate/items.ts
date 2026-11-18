// climateItems: the climate list's items, the house, each room and the heat pump, with their status words, figures and tones.
// Pattern: a pure function at the language seam (ADR 0013), a humble object's other half (Meszaros, Fowler): inputs in, the strings
// the list and the phone's tiles place out, every word through `deps.t`; the legacy `climItems()`'s rules.
// Must not: import Lit or the DOM, read state or the clock, or hold a word a person reads (a catalog key says it).
import {withSuffix} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {power, temperatureFigure, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {roomName, type RoomNameDeps} from '../../core/i18n/room-name.ts';
import type {HeatPumpInputs} from '../../providers/heat-pump.ts';
import type {IconName} from '../../ui/icons.ts';
import {bareReading, type Reading} from '../../ui/reading.ts';
import {OFF_AT_OR_BELOW, type RoomPower} from '../../providers/power.ts';
import type {ClimateInputs} from './inputs.ts';

/** The heat pump's actions, and the modes that stand in for a missing action, that the catalog words, by what Home Assistant says; any other is shown as it says it. */
const ACTION_WORDS: ReadonlyMap<string, MessageKey> = new Map([
  ['heating', 'climate.action.heating'],
  ['cooling', 'climate.action.cooling'],
  ['idle', 'climate.action.idle'],
  ['heat', 'climate.action.heat'],
  ['cool', 'climate.action.cool'],
  ['auto', 'climate.action.auto'],
  ['dry', 'climate.action.dry'],
  ['fan', 'climate.action.fan'],
]);

/** `on` for what is heating, `bad` for what is offline or unavailable. */
export type Tone = '' | 'on' | 'bad';

export interface ClimateItem extends Pick<Reading, 'value' | 'missing'> {
  /** `house`, `hp`, or the room's key. */
  id: string;
  /** The glyph's name: the room's own, `house` for the whole house, `fan` for the heat pump. */
  icon: IconName;
  name: string;
  sub: string;
  tone: Tone;
}

/** The words, the figures and the names an item is written with. */
export interface ClimateItemsDeps extends RoomNameDeps {
  fmt: Formatters;
}

/** What Home Assistant says the heat pump is doing, as the catalog words it, else as it says it. */
export function actionWord(said: string, t: Translate): string {
  const word = ACTION_WORDS.get(said);
  return word ? t(word) : said;
}

/** The mean of the rooms that read a temperature; null when none does. */
export function averageTemperature(rooms: readonly RoomPower[]): number | null {
  const temperatures = rooms.flatMap(room => (room.temperature === null ? [] : [room.temperature]));
  return temperatures.length ? temperatures.reduce((sum, v) => sum + v, 0) / temperatures.length : null;
}

/** How many rooms are heating. */
export const heatingCount = (rooms: readonly RoomPower[]): number => rooms.filter(room => room.heating).length;

/** A room's status line, the legacy `climItems()`'s order of questions: unavailable, heating, holding a setpoint above the frost guard, else off. */
function roomStatus(room: RoomPower, {t, fmt}: ClimateItemsDeps): string {
  if (!room.available) return t('climate.unavailable');
  if (room.heating) return t('climate.heatingKw', {power: power(fmt, (room.power ?? 0) * 1000)});
  if (room.setpoint !== null && room.setpoint > OFF_AT_OR_BELOW)
    return t('climate.holding', {n: fmt.number(room.setpoint, 2)});
  return t('climate.off');
}

/** The heat pump's status line: not found, offline, off, else its action, to its setpoint when it has one; `brand` is the maker's name, else the catalog's word. */
function heatPumpStatus(heatPump: HeatPumpInputs, brand: string, {t, fmt}: ClimateItemsDeps): string {
  if (!heatPump.present) return t('climate.notFound');
  if (!heatPump.available) return t('climate.hpOffline', {brand});
  if (heatPump.mode === 'off') return t('climate.hpOff', {brand});
  const action = actionWord(heatPump.action || heatPump.mode, t);
  if (heatPump.target === null) return t('climate.hpAction', {brand, action});
  return t('climate.hpActionTo', {brand, action, n: fmt.number(heatPump.target, 2)});
}

/** A temperature to a tenth with its degree sign, for an item or a tile that writes the sign in its figure; null for no reading. */
export const degreesOf = (fmt: Formatters, n: number | null): string | null =>
  withSuffix(temperatureFigure(fmt, n), '°');

/** The items in list order: the whole house, each room, then the heat pump when the house has one. */
export function climateItems({rooms, heatPump, heatPumpOn}: ClimateInputs, deps: ClimateItemsDeps): ClimateItem[] {
  const {t, fmt} = deps;
  const average = averageTemperature(rooms);
  const heating = heatingCount(rooms);
  const items: ClimateItem[] = [
    {
      id: 'house',
      icon: 'house',
      name: t('climate.wholeHouse'),
      sub: t(heatPumpOn ? 'climate.heatPumpPlusRooms' : 'climate.roomsHeating', {n: heating}),
      ...bareReading(t, degreesOf(fmt, average)),
      tone: heating || heatPumpOn ? 'on' : '',
    },
    ...rooms.map((room): ClimateItem => ({
      id: room.key,
      icon: room.icon,
      name: roomName(room, deps),
      sub: roomStatus(room, deps),
      ...bareReading(t, degreesOf(fmt, room.temperature)),
      tone: room.heating ? 'on' : !room.available ? 'bad' : '',
    })),
  ];
  if (heatPump) {
    items.push({
      id: 'hp',
      icon: 'fan',
      name: t('climate.heatPump'),
      sub: heatPumpStatus(heatPump, heatPump.brand ?? t('climate.heatPump'), deps),
      ...bareReading(t, heatPump.available ? degreesOf(fmt, heatPump.temperature) : null),
      tone: !heatPump.available ? 'bad' : heatPumpOn ? 'on' : '',
    });
  }
  return items;
}
