// The Lights commands as data: every intent of a tile or a room's sheet is a pure function returning the service calls to run, in order.
// Pattern: Command (Gamma et al.), the data half (ADR 0023): the kit's `CommandRunner.runAll` is the invoker. The rules are the legacy `lightCmd`
// and `linkTo`, one function per intent, whose copies go with the sheet (#262). The legacy commands hold no value while Home Assistant answers,
// so these carry no `holds` either: a tap still waits for the reply, and the timing stays the legacy panel's.
// Must not: send a call, read the clock, `hass` or the DOM (a tile carries its state and mode), write the system data (the pane's controller does).
import type {Command} from '../../core/commands.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {LightTile} from './inputs.ts';

/** What a command reads of a tile: its lights, its switch, its mode and its state. */
export type CommandTile = Pick<LightTile, 'key' | 'ids' | 'al' | 'mode' | 'state' | 'link'>;

/** Whether the house can take a room off Auto by `adaptive_lighting.set_manual_control` (`hasManualControlService`). */
export interface LightServices {
  manualControl: boolean;
}

const call = (domain: string, service: string, data: Record<string, unknown>): Command => ({domain, service, data});
/** The toast said after the last call of a list. */
const saying = (commands: Command[], key: MessageKey): Command[] =>
  commands.length ? [...commands.slice(0, -1), {...commands[commands.length - 1], done: {key}}] : commands;

/** A tile and its partner, which act as one room: the tile alone when it is not linked. */
export function pairOf<T extends CommandTile>(tile: T, tiles: T[]): T[] {
  const partner = tile.link ? tiles.find(o => o.key === tile.link!.other) : undefined;
  return partner ? [tile, partner] : [tile];
}

const idsOf = (pair: CommandTile[]) => pair.flatMap(x => x.ids);
const litOf = (pair: CommandTile[]) => pair.flatMap(x => x.state.on);

/** All off: one `light.turn_off` with every lit light of the house; nothing when none is lit. */
export function allOff(tiles: CommandTile[]): Command[] {
  const lit = litOf(tiles);
  return lit.length ? [call('light', 'turn_off', {entity_id: lit})] : [];
}

/** A bulb's chip: `light.toggle`. */
export const toggleOne = (id: string): Command[] => [call('light', 'toggle', {entity_id: id})];

/** A tile's bulb or the sheet's power button: the pair off when the tile's own lights are on, else on. */
export function toggleArea(pair: CommandTile[]): Command[] {
  return [call('light', pair[0].state.any ? 'turn_off' : 'turn_on', {entity_id: idsOf(pair)})];
}

/** Back to the schedule: the switch on (when it is off) and, when the service exists, none of the room's lights held by hand. */
function resume(x: CommandTile, services: LightServices): Command[] {
  return [
    ...(x.mode.alOn ? [] : [call('switch', 'turn_on', {entity_id: x.al})]),
    ...(services.manualControl
      ? [call('adaptive_lighting', 'set_manual_control', {entity_id: x.al, lights: x.ids, manual_control: false})]
      : []),
  ];
}

/** Whether the pair is under Auto: every tile with a switch is. The Auto switch shows it, and a tap turns it the other way. */
export const isAuto = (pair: CommandTile[]): boolean => pair.every(x => !x.al || x.mode.auto);

/** Auto on: each switch takes its room back (Night stays as it was); Auto off: each switch lets go, and Night with it. */
export function setAuto(pair: CommandTile[], on: boolean, services: LightServices): Command[] {
  const commands = pair
    .filter(x => x.al)
    .flatMap(x =>
      on
        ? resume(x, services)
        : [
            call('switch', 'turn_off', {entity_id: x.al}),
            ...(x.mode.nightOn ? [call('switch', 'turn_off', {entity_id: x.mode.nightSwitch})] : []),
          ],
    );
  return saying(commands, on ? 'lights.autoOn' : 'lights.autoOff');
}

/** Whether the tile is in Night: its sleep mode and its switch on. */
export const isNight = (tile: CommandTile): boolean => tile.mode.nightOn && tile.mode.alOn;

/** Night on or off for each tile with a sleep mode; Night needs Adaptive Lighting, so turning it on also hands the room back to Auto. */
export function setNight(pair: CommandTile[], on: boolean, services: LightServices): Command[] {
  const commands = pair
    .filter(x => x.mode.nightSwitch)
    .flatMap(x => [
      call('switch', on ? 'turn_on' : 'turn_off', {entity_id: x.mode.nightSwitch}),
      ...(on ? resume(x, services) : []),
    ]);
  return saying(commands, on ? 'lights.nightOn' : 'lights.nightOff');
}

/** By hand, a room leaves Auto and Night until Auto is turned on again: Night off, then its lights held by hand, or the switch off without the service. */
function leaveAuto(pair: CommandTile[], services: LightServices): Command[] {
  return pair
    .filter(x => x.al && (x.mode.auto || x.mode.nightOn))
    .flatMap(x => [
      ...(x.mode.nightOn ? [call('switch', 'turn_off', {entity_id: x.mode.nightSwitch})] : []),
      services.manualControl
        ? call('adaptive_lighting', 'set_manual_control', {entity_id: x.al, lights: x.ids, manual_control: true})
        : call('switch', 'turn_off', {entity_id: x.al}),
    ]);
}

/** The lights a level is sent to: the lit ones, else all of them. */
function targets(pair: CommandTile[]): string[] {
  const lit = litOf(pair);
  return lit.length ? lit : idsOf(pair);
}

/** A level set by hand: the leave-Auto calls, then the light's, with the toast when the room left Auto. */
const byHand = (leave: Command[], light: Command): Command[] =>
  leave.length ? saying([...leave, light], 'lights.setByHand') : [light];

/** The brightness slider's release: leave Auto, then off under one percent, else on at `pct` (the lit lights, else all). */
export function setBrightness(pair: CommandTile[], pct: number, services: LightServices): Command[] {
  const leave = leaveAuto(pair, services);
  const light =
    pct < 1
      ? call('light', 'turn_off', {entity_id: idsOf(pair)})
      : call('light', 'turn_on', {entity_id: targets(pair), brightness_pct: pct});
  return byHand(leave, light);
}

/** The colour slider's release: leave Auto, then the colour temperature to the lit (else all) lights that take one; no light call when none does. */
export function setColorTemp(pair: CommandTile[], kelvin: number, services: LightServices): Command[] {
  const leave = leaveAuto(pair, services);
  const tunable = new Set(pair.flatMap(x => x.state.tunable));
  const ids = targets(pair).filter(id => tunable.has(id));
  if (!ids.length) return leave;
  return byHand(leave, call('light', 'turn_on', {entity_id: ids, color_temp_kelvin: kelvin}));
}

/** What picking a partner does: the pairs to save for every screen, the toast once they are saved, and the calls that copy the light. */
export interface LinkChange {
  pairs: string[][];
  toast: MessageKey;
  commands: Command[];
}

/**
 * Picks `partnerKey` as the tile's partner, or none with `''`: the two rooms' old pairs go, the new pair joins, and a new partner starts out
 * matching: dark when this room is, else at this room's brightness, with its colour temperature too when it was set by hand (under Auto the
 * colour follows on its own). Null when nothing changes: the partner is the current one, or no tile has its key.
 */
export function link(tile: CommandTile, partnerKey: string, tiles: CommandTile[]): LinkChange | null {
  const partner = partnerKey ? tiles.find(x => x.key === partnerKey) : undefined;
  if ((partnerKey && !partner) || (tile.link?.other ?? '') === partnerKey) return null;
  const current = tiles.filter(x => x.link?.first).map(x => [x.key, x.link!.other]);
  const pairs = current.filter(p => !p.includes(tile.key) && !(partnerKey && p.includes(partnerKey)));
  if (!partner) return {pairs, toast: 'lights.roomUnlinked', commands: []};
  pairs.push([tile.key, partner.key]);
  return {pairs, toast: 'lights.roomsLinked', commands: copyOnto(tile, partner)};
}

/** The partner takes this room's light. */
function copyOnto(tile: CommandTile, partner: CommandTile): Command[] {
  const {state, mode} = tile;
  if (!state.on.length) return partner.state.any ? [call('light', 'turn_off', {entity_id: partner.ids})] : [];
  const tunable = partner.ids.filter(id => partner.state.tunable.includes(id));
  if (!state.k || mode.auto || !tunable.length)
    return [call('light', 'turn_on', {entity_id: partner.ids, brightness_pct: state.br})];
  const rest = partner.ids.filter(id => !tunable.includes(id));
  return [
    call('light', 'turn_on', {entity_id: tunable, brightness_pct: state.br, color_temp_kelvin: state.k}),
    ...(rest.length ? [call('light', 'turn_on', {entity_id: rest, brightness_pct: state.br})] : []),
  ];
}
