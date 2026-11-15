// securityModel: the cameras and the door and motion sensors in, the strings and flags the Security pane, its two cards and the
// Home card place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no
// store, words every message through `deps.t` and times through `deps.fmt`, and takes the providers' inputs as the contract (ADR 0025).
// Each rule is the legacy panel's own (`renderCameras`, `renderSensors`, `sensorState`, the summary lines), deleted by #227.
// Must not: import the DOM, the kit or the shell, read the clock, or hold text the household reads (a catalog key says it).
import {capitalise} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {CameraInputs} from '../../providers/camera-source.ts';
import type {SensorInputs, SensorKind} from '../../providers/door-motion.ts';
import {activeOf, type ActiveSnapshot} from './activity.ts';
import type {SecurityInputs} from './inputs.ts';

/** How often a camera's snapshot is asked for again: the URL's stamp changes this often, in milliseconds. */
export const SNAPSHOT_MS = 10_000;
/** A battery under this percentage is worth a word. */
const BATTERY_LOW = 20;
/** The Home card shows this many cameras. */
const HOME_CAMERAS = 4;
/** Home Assistant's camera states the catalog words, each with its key; any other state is shown capitalised. */
const CAMERA_STATES: ReadonlyMap<string, MessageKey> = new Map([
  ['idle', 'security.state.idle'],
  ['recording', 'security.state.recording'],
  ['streaming', 'security.state.streaming'],
]);

export interface SecurityModelDeps {
  /** The instant the model is read at, in milliseconds: the stamp, every "ago" and every "for". */
  now: number;
  t: Translate;
  fmt: Formatters;
}

export interface CameraTile {
  id: string;
  name: string;
  /** The snapshot with the ten-second stamp; null when the camera is offline or has none, and the tile draws an icon. */
  picture: string | null;
  /** The line under the name: "Motion now", "Motion 5 min ago", "Idle" or "Offline". */
  when: string;
  moving: boolean;
  offline: boolean;
  /** The tile's name for a screen reader. */
  label: string;
  /** The Home card's tag after the name while it moves: "· motion"; empty otherwise. */
  tag: string;
  /** The camera sheet's line: "Idle · motion now", "Offline · last motion 5 min ago". */
  detail: string;
}

export type SensorTone = '' | 'warn' | 'act' | 'off';

export interface SensorRow {
  id: string;
  kind: SensorKind;
  name: string;
  tone: SensorTone;
  /** "Open", "Closed", "Motion now", "No motion" or "Offline". */
  main: string;
  /** What follows it, joined with " · ": "for 12 min · battery 9%"; empty when there is nothing to say. */
  sub: string;
  /** The row's name for a screen reader: "Front door history". */
  label: string;
}

export interface SecurityViewModel {
  /** The pane's line under its title: "2 cameras · all doors closed · motion now". */
  summary: string;
  cameras: {
    /** The card's title. */
    title: string;
    /** "2 cameras", or "Not connected" without any. */
    count: string;
    empty: boolean;
    /** What the empty card says: a title, the hint and the link's text. */
    emptyText: {title: string; hint: string; link: string};
    tiles: CameraTile[];
    /** The camera sheet's note over a camera that is offline. */
    offlineNote: string;
  };
  sensors: {
    /** No sensor at all: the card is hidden. */
    hidden: boolean;
    title: string;
    /** "2 doors open" in amber, "All doors closed", "Door closed", or none without doors. */
    line: {text: string; warn: boolean} | null;
    rows: SensorRow[];
  };
  home: {
    /** The compact line under "Security" on the Home card. */
    line: string;
    /** The first four cameras. */
    cameras: CameraTile[];
    rows: SensorRow[];
    /** What the card says without any sensor; null with some. */
    hint: string | null;
    /** Each sensor on or not: the Home card keeps the previous one and glows for what `newlyActive` finds between the two. */
    active: ActiveSnapshot;
  };
}

/** The line the pane, the Home card and the card's header build from the same facts, joined with " · " without the empty ones. */
const joined = (...parts: string[]): string => parts.filter(Boolean).join(' · ');

/** The snapshot's URL with the stamp the model gives it, so the browser asks again every ten seconds. */
function stamped(picture: string, now: number): string {
  return `${picture}${picture.includes('?') ? '&' : '?'}t=${Math.floor(now / SNAPSHOT_MS)}`;
}

/** A state the catalog words, else the state capitalised. */
function stateText(state: string, t: Translate): string {
  const key = CAMERA_STATES.get(state);
  return key ? t(key) : capitalise(state);
}

/** A camera's motion words: the tile's line ("Motion 5 min ago") and the sheet's fragment ("last motion 5 min ago"); null without a motion sensor. */
function motionWords(
  motion: CameraInputs['motion'],
  {now, t, fmt}: SecurityModelDeps,
): {when: string; line: string} | null {
  if (!motion) return null;
  if (motion.on) return {when: t('security.motionNow'), line: t('security.summary.motionNow')};
  const ago = fmt.ago(motion.since, now);
  return {when: t('security.motionAgo', ago), line: t('security.lastMotion', ago)};
}

function cameraTile(camera: CameraInputs, deps: SecurityModelDeps): CameraTile {
  const {now, t} = deps;
  const moving = !!camera.motion?.on;
  const motion = motionWords(camera.motion, deps);
  const state = camera.available ? stateText(camera.state, t) : t('security.offline');
  return {
    id: camera.id,
    name: camera.name,
    picture: camera.available && camera.picture ? stamped(camera.picture, now) : null,
    when: motion?.when ?? state,
    moving,
    offline: !camera.available,
    label: t('security.openLive', {name: camera.name}),
    tag: moving ? t('security.motionTag') : '',
    detail: joined(state, motion?.line ?? ''),
  };
}

/** The for-how-long of a sensor that is on, as the catalog words `fmt.ago`'s kind and count without "ago": "for 12 min". */
function forDuration(since: number, {now, t, fmt}: SecurityModelDeps): string {
  return t('security.forDuration', fmt.ago(since, now));
}

// a door's row and a motion sensor's differ in shape, not only in words (what an open door says, a motion sensor's light), so
// each is written out rather than read from history.ts's table of keys by kind
function sensorRow(sensor: SensorInputs, deps: SecurityModelDeps): SensorRow {
  const {now, t, fmt} = deps;
  const label = t('security.history', {name: sensor.name});
  const base = {id: sensor.id, kind: sensor.kind, name: sensor.name, label};
  if (!sensor.available) return {...base, tone: 'off', main: t('security.offline'), sub: ''};
  const low =
    sensor.battery !== null && sensor.battery < BATTERY_LOW
      ? t('security.batteryLow', {n: String(Math.round(sensor.battery))})
      : '';
  const ago = t('security.ago', fmt.ago(sensor.since, now));
  if (sensor.kind === 'door')
    return {
      ...base,
      tone: sensor.on ? 'warn' : '',
      main: t(sensor.on ? 'security.open' : 'security.closed'),
      sub: joined(sensor.on ? forDuration(sensor.since, deps) : ago, low),
    };
  const lux = sensor.illuminance === null ? '' : t('security.lux', {n: String(Math.round(sensor.illuminance))});
  return {
    ...base,
    tone: sensor.on ? 'act' : '',
    main: t(sensor.on ? 'security.motionNow' : 'security.noMotion'),
    sub: joined(sensor.on ? '' : ago, lux, low),
  };
}

export function securityModel(inputs: SecurityInputs, deps: SecurityModelDeps): SecurityViewModel {
  const {t} = deps;
  const tiles = inputs.cameras.map(camera => cameraTile(camera, deps));
  const rows = inputs.sensors.map(sensor => sensorRow(sensor, deps));
  const doors = inputs.sensors.filter(sensor => sensor.kind === 'door');
  const open = doors.filter(door => door.on).length;
  const moving = inputs.sensors.some(sensor => sensor.kind === 'motion' && sensor.on);
  const count = t('security.camerasCount', {n: tiles.length});
  /** The doors' line, once there is a door: how many are open, else the closed message the line wants. */
  const doorsLine = (closed: MessageKey): string => (open ? t('security.doorsOpen', {n: open}) : t(closed));

  return {
    summary: joined(
      tiles.length ? count : t('security.summary.noCameras'),
      doors.length ? doorsLine('security.summary.allDoorsClosed') : '',
      moving ? t('security.summary.motionNow') : '',
    ),
    cameras: {
      title: t('security.cameras'),
      count: tiles.length ? count : t('security.notConnected'),
      empty: tiles.length === 0,
      emptyText: {
        title: t('security.noCamerasYet'),
        hint: t('security.addProtectHint'),
        link: t('security.addProtect'),
      },
      tiles,
      offlineNote: t('security.cameraOffline'),
    },
    sensors: {
      hidden: rows.length === 0,
      title: t('security.doorsMotion'),
      line: doors.length
        ? {text: doorsLine(doors.length === 1 ? 'security.doorClosed' : 'security.allDoorsClosed'), warn: open > 0}
        : null,
      rows,
    },
    home: {
      line: joined(
        tiles.length ? count : '',
        doors.length ? doorsLine('security.summary.allDoorsClosed') : '',
        t(moving ? 'security.summary.motionNow' : 'security.summary.noMotion'),
      ),
      cameras: tiles.slice(0, HOME_CAMERAS),
      rows,
      hint: rows.length ? null : t('security.noSensorsYet'),
      active: activeOf(inputs.sensors),
    },
  };
}
