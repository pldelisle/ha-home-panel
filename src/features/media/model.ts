// mediaModel: the television and the speakers in, the strings and flags the Media pane, the phone's tiles and the Home card place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no
// store, words every message through `deps.t`, and reads a held value through `deps.overlay`, the one place a tap shows before Home
// Assistant agrees. Each rule is the legacy panel's (renderMedia, renderMediaTiles, renderTV, tvBox, renderPaneSubs), until #220 deletes them.
// Must not: import the DOM, the kit or the shell, send a command, or hold text the household reads (a catalog key says it).
import type {Messages} from '../../core/i18n/messages.ts';
import type {Names} from '../../core/i18n/names.ts';
import {K, type Overlay} from './commands.ts';
import type {MediaInputs, SpeakerInputs} from './inputs.ts';
import type {TvInputs} from '../../providers/tv-source.ts';

type Translate = Messages['t'];

// `supported_features` is a bit field: Home Assistant's `MediaPlayerEntityFeature`, of which Media reads three bits
const PAUSE = 1; // MediaPlayerEntityFeature.PAUSE = 1
const VOLUME_SET = 4; // MediaPlayerEntityFeature.VOLUME_SET = 4
const PLAY = 16384; // MediaPlayerEntityFeature.PLAY = 16384

export interface MediaModelDeps {
  t: Translate;
  /** The panel's held values (`OptimisticController.read`): applied to `on`, `muted`, `state` and `volume`. */
  overlay: Overlay;
  /** The display names: a speaker's room is its area's name as the panel shows it. */
  names: Names;
}

/** One button of the television's box: its label on the Home card (an icon) and what the pane draws (text, or an icon when null). */
export interface TvControl {
  label: string;
  pane: {text: string | null; label: string};
}

export interface TvView {
  name: string;
  on: boolean;
  /** False when the set is `unavailable` and the house has no wake button to try. */
  available: boolean;
  muted: boolean;
  /** The input while the set is on, or an empty string. */
  sourceLabel: string;
  /** "On", "On · muted", "Off" or "Not responding": the Home card's line under the name. */
  status: string;
  /** The pane's line under the name: the status, then the input. */
  statusLine: string;
  /** What the pane's screen says while the set is on (the input, else "On"); null while it is off, and the pane draws an icon. */
  screenLabel: string | null;
  /** The Home card's top-right: "Unavailable", else the input. */
  cardRight: string;
  /** The power switch's name for a screen reader. */
  switchLabel: string;
  controlsLabel: string;
  /** The pane's note that there is no volume slider. */
  hint: string;
  controls: {volumeDown: TvControl; volumeUp: TvControl; mute: TvControl; playPause: TvControl};
}

export interface VolumeView {
  /** A whole percent, never a negative zero. */
  percent: number;
  text: string;
  /** The small word under the figure. */
  caption: string;
  /** The stepper's name for a screen reader. */
  label: string;
  downLabel: string;
  upLabel: string;
  atMin: boolean;
  atMax: boolean;
}

export interface SpeakerView {
  id: string;
  /** Its area's name, else its own name. */
  room: string;
  name: string;
  playing: boolean;
  available: boolean;
  /** A track is loaded: the player plays or is paused on something with a title. */
  loaded: boolean;
  title: string | null;
  /** The artist of a loaded track, or null. */
  artist: string | null;
  /** The artist (else the album) of a loaded track; else the name and why nothing plays. */
  subLine: string;
  picture: string | null;
  /** Null when the player cannot set a volume or reports none: no stepper. */
  volume: VolumeView | null;
  playPause: {enabled: boolean; label: string; icon: 'play' | 'pause'};
}

export type MediaControlView =
  | {kind: 'switch'; checked: boolean; label: string; disabled: boolean}
  | {kind: 'play'; playing: boolean; label: string; disabled: boolean};

/** A tile of the phone's Media list: the television, or a speaker. */
export interface MediaTileView {
  /** `tv`, or the speaker's id. */
  key: string;
  kind: 'tv' | 'speaker';
  title: string;
  /** The title of the sheet the tile opens. */
  sheetTitle: string;
  /** The tile's description for a screen reader: it opens the controls. */
  description: string;
  subLine: string;
  on: boolean;
  picture: string | null;
  control: MediaControlView;
}

export interface MediaViewModel {
  /** The pane's sub-line: "TV on · Netflix · 2 speakers playing", "TV off · 3 speakers · nothing playing", or an empty string. */
  summary: string;
  tv: TvView | null;
  speakers: SpeakerView[];
  /** The speakers card's top-right: "2 speakers playing", "Nothing playing" or "None found". */
  speakersLine: string;
  tiles: MediaTileView[];
  /** The words the pane draws around its cards. */
  labels: {speakers: string; noDevices: string; noSpeakers: string};
}

/** The television's view: a held `on` and `mute` replace what the player says until it agrees. */
function tvView(tv: TvInputs, {t, overlay}: MediaModelDeps): TvView {
  const live = tv.state !== 'unavailable';
  // a set that is off the network can still be woken by its wake-on-LAN button, so it is not "not responding" then
  const available = live || tv.wakeButton !== null;
  const on = overlay(K.on(tv.id), live && tv.state === 'on') === true;
  const muted = overlay(K.mute(tv.id), tv.muted);
  const sourceLabel = on && tv.source ? tv.source : '';
  const name = tv.name ?? t(tv.defaultName);
  const status = !available ? t('media.notResponding') : on ? t(muted ? 'media.onMuted' : 'media.on') : t('media.off');
  // the French layer leaves "muted" in English over an input (`Activé · muted · Netflix`), so that line is a message of its own
  const statusLine = !sourceLabel
    ? status
    : available && on && muted
      ? t('media.onMutedSource', {source: sourceLabel})
      : `${status} · ${sourceLabel}`;
  const playOrPause = t('media.playOrPause');
  return {
    name,
    on,
    available,
    muted,
    sourceLabel,
    status,
    statusLine,
    screenLabel: on ? sourceLabel || t('media.on') : null,
    cardRight: !available ? t('media.unavailable') : sourceLabel,
    switchLabel: t('media.tvPower', {name}),
    controlsLabel: t('media.volumeAndPlayback'),
    hint: t('media.noVolumeSlider'),
    controls: {
      volumeDown: {
        label: t('media.volumeDown'),
        pane: {text: t('media.volumeDownShort'), label: t('media.volumeDownPane')},
      },
      volumeUp: {label: t('media.volumeUp'), pane: {text: t('media.volumeUpShort'), label: t('media.volumeUpPane')}},
      mute: {label: t(muted ? 'media.unmute' : 'media.mute'), pane: {text: t('media.mute'), label: t('media.mute')}},
      playPause: {label: playOrPause, pane: {text: null, label: playOrPause}},
    },
  };
}

/** The speaker's view: a held `state` and `volume` replace what the player says until it agrees. */
function speakerView(speaker: SpeakerInputs, {t, overlay, names}: MediaModelDeps): SpeakerView {
  const live = speaker.available;
  const state = overlay(K.state(speaker.id), speaker.state);
  const playing = state === 'playing';
  const can = (bit: number) => live && (speaker.features & bit) === bit;
  const loaded = live && (state === 'playing' || state === 'paused') && !!speaker.title;
  const room = names.name(speaker.areaId, speaker.name);
  const volume = overlay(K.volume(speaker.id), speaker.volume);
  // + 0: the -0 of a tiny negative level would print as "-0"
  const percent = Math.round((volume ?? 0) * 100) + 0;
  const nothing = t('media.speakerState', {
    name: speaker.name,
    state: !live
      ? 'unavailable'
      : state === 'paused'
        ? 'paused'
        : state === 'off' || state === 'standby'
          ? 'off'
          : 'idle',
  });
  return {
    id: speaker.id,
    room,
    name: speaker.name,
    playing,
    available: live,
    loaded,
    title: loaded ? speaker.title : null,
    artist: loaded ? speaker.artist || null : null,
    subLine: loaded ? speaker.artist || speaker.album || '' : nothing,
    picture: loaded ? speaker.picture : null,
    volume:
      can(VOLUME_SET) && volume !== null
        ? {
            percent,
            text: t('media.percent', {percent}),
            caption: t('media.volume'),
            label: t('media.volumeOf', {room}),
            downLabel: t('media.volumeDown'),
            upLabel: t('media.volumeUp'),
            atMin: volume <= 0,
            atMax: volume >= 1,
          }
        : null,
    playPause: {
      enabled: (loaded || state === 'paused') && can(playing ? PAUSE : PLAY),
      label: t(playing ? 'media.pause' : 'media.play'),
      icon: playing ? 'pause' : 'play',
    },
  };
}

/**
 * The pane's sub-line. It counts what Home Assistant says, as the legacy line did, not what a tap holds: the pod and the tile
 * flip at once, this line follows the player. A speaker count after a television part has its own message, which French words
 * differently from the same count alone (the layer's rule for a text that is not the whole line).
 */
function summaryOf({tv, speakers}: MediaInputs, t: Translate): string {
  const playing = speakers.filter(speaker => speaker.state === 'playing').length;
  const parts = [
    ...(tv ? [t(tv.state === 'on' ? 'media.summaryTvOn' : 'media.summaryTvOff')] : []),
    // the legacy line cuts only the dash: a full-width ampersand stays in it, where the box and the tile make it plain
    ...(tv?.state === 'on' && tv.summarySource ? [tv.summarySource] : []),
    ...(speakers.length === 0
      ? []
      : playing > 0
        ? [t(tv ? 'media.summaryPlaying' : 'media.speakersPlaying', {count: playing})]
        : [t('media.summaryIdle', {count: speakers.length})]),
  ];
  return parts.join(' · ');
}

function tvTile(tv: TvView, t: Translate): MediaTileView {
  return {
    key: 'tv',
    kind: 'tv',
    title: tv.name,
    sheetTitle: tv.name,
    description: t('media.opensControls'),
    // not the muted status: the phone's tile never said it
    subLine: tv.available && tv.on ? `${t('media.on')}${tv.sourceLabel ? ` · ${tv.sourceLabel}` : ''}` : tv.status,
    on: tv.on,
    picture: null,
    control: {kind: 'switch', checked: tv.on, label: tv.switchLabel, disabled: !tv.available},
  };
}

function speakerTile(speaker: SpeakerView, t: Translate): MediaTileView {
  return {
    key: speaker.id,
    kind: 'speaker',
    title: speaker.room,
    sheetTitle: t('media.speakers'),
    description: t('media.opensControls'),
    subLine: speaker.loaded ? `${speaker.title}${speaker.artist ? ` · ${speaker.artist}` : ''}` : speaker.subLine,
    on: speaker.playing,
    picture: speaker.picture,
    control: {
      kind: 'play',
      playing: speaker.playing,
      label: speaker.playPause.label,
      disabled: !speaker.playPause.enabled,
    },
  };
}

export function mediaModel(inputs: MediaInputs, deps: MediaModelDeps): MediaViewModel {
  const {t} = deps;
  const tv = inputs.tv ? tvView(inputs.tv, deps) : null;
  const speakers = inputs.speakers.map(speaker => speakerView(speaker, deps));
  const playing = inputs.speakers.filter(speaker => speaker.state === 'playing').length;
  return {
    summary: summaryOf(inputs, t),
    tv,
    speakers,
    speakersLine: !speakers.length
      ? t('media.noneFound')
      : playing > 0
        ? t('media.speakersPlaying', {count: playing})
        : t('media.nothingPlaying'),
    tiles: [...(tv ? [tvTile(tv, t)] : []), ...speakers.map(speaker => speakerTile(speaker, t))],
    labels: {speakers: t('media.speakers'), noDevices: t('media.noDevices'), noSpeakers: t('media.playersHint')},
  };
}
