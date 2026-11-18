// mediaModel and mediaBrief: the television and the speakers in, the strings and flags the Media pane, the phone's tiles and the More
// sheet's line place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no
// store, words every message through `deps.t`, and reads a held value through `deps.overlay`, the one place a tap shows before Home
// Assistant agrees. Each rule is the legacy panel's pane, tiles and box (`renderMedia`, `renderMediaTiles`, `tvBox`), all deleted.
// Must not: import the DOM, the kit or the shell, send a command, or hold text the household reads (a catalog key says it).
import type {Messages} from '../../core/i18n/messages.ts';
import type {Names} from '../../core/i18n/names.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {K} from './commands.ts';
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

/** One button of the television's box: what it says (text, or an icon when null) and its name for a screen reader. */
export interface TvControl {
  text: string | null;
  label: string;
}

/** The television's play button: its glyph and name say what a press will do, as a speaker's do. */
export interface TvPlayControl extends TvControl {
  icon: 'play' | 'pause';
}

export interface TvView {
  /** The player and its wake-on-LAN button, which the box's commands name (`tvPower` and the others). */
  id: string;
  wakeButton: string | null;
  name: string;
  on: boolean;
  /** False when the set is `unavailable` and the house has no wake button to try. */
  available: boolean;
  muted: boolean;
  /** The input while the set is on, or an empty string. */
  sourceLabel: string;
  /** "On", "On · muted", "Off" or "Not responding": the pane's line under the name, and what the phone's tile starts from. */
  status: string;
  /** The line under the status while the set is on and names an input ("Now on Netflix"), else null. */
  nowOn: string | null;
  /** The power button's name for a screen reader: it says what a press does ("Turn the TV off"). */
  powerLabel: string;
  controlsLabel: string;
  controls: {volumeDown: TvControl; volumeUp: TvControl; mute: TvControl; playPause: TvPlayControl};
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
  /** The shown level, 0 to 1: the held or the reported one. The stepper takes its steps and bounds from it. */
  level: number;
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

/**
 * A tile's one control, with what its command names: the television's power button, or a speaker's play button. A speaker's
 * volume rides with it, so the tile draws the pod's slider; `speaker.room` is the name the card shows and the toast says.
 */
export type MediaControlView =
  | {kind: 'power'; on: boolean; label: string; disabled: boolean; tv: Pick<TvView, 'id' | 'wakeButton'>}
  | {
      kind: 'play';
      playing: boolean;
      label: string;
      disabled: boolean;
      icon: 'play' | 'pause';
      speaker: Pick<SpeakerView, 'id' | 'room'>;
      volume: VolumeView | null;
    };

/** A tile of the phone's Media list: the television, or a speaker. */
export interface MediaTileView {
  /** `tv`, or the speaker's id. */
  key: string;
  kind: 'tv' | 'speaker';
  /** The tile's icon, and the badge of the sheet it opens. */
  icon: 'tv' | 'spk';
  title: string;
  /** The title of the sheet the tile opens. */
  sheetTitle: string;
  /** The tile's description for a screen reader: it opens the controls. */
  description: string;
  subLine: string;
  /** The sub-line is a track's title and artist, which a browser's translator leaves as they are. */
  track: boolean;
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
  return {
    id: tv.id,
    wakeButton: tv.wakeButton,
    name,
    on,
    available,
    muted,
    sourceLabel,
    status,
    nowOn: sourceLabel ? t('media.nowOn', {source: sourceLabel}) : null,
    powerLabel: t(on ? 'media.tvPowerOff' : 'media.tvPowerOn'),
    controlsLabel: t('media.volumeAndPlayback'),
    controls: {
      volumeDown: {text: t('media.volumeDownShort'), label: t('media.volumeDownPane')},
      volumeUp: {text: t('media.volumeUpShort'), label: t('media.volumeUpPane')},
      mute: {text: t('media.mute'), label: t('media.mute')},
      playPause: {
        text: null,
        label: t(tv.paused ? 'media.play' : 'media.pause'),
        icon: tv.paused ? 'play' : 'pause',
      },
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
            level: volume,
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
/** How many speakers Home Assistant says are playing: the lines count these, not what a tap holds. */
const playingCount = (speakers: readonly SpeakerInputs[]): number =>
  speakers.filter(speaker => speaker.state === 'playing').length;

/** "TV on" or "TV off", the part a line opens with when the house has a television. */
const tvWord = (tv: TvInputs, t: Translate): string =>
  t(tv.state === 'on' ? 'media.summaryTvOn' : 'media.summaryTvOff');

/** "2 speakers playing", worded after a television part or alone: French words the two differently. */
const playingWord = (playing: number, afterTv: boolean, t: Translate): string =>
  t(afterTv ? 'media.summaryPlaying' : 'media.speakersPlaying', {count: playing});

function summaryOf({tv, speakers}: MediaInputs, t: Translate): string {
  const playing = playingCount(speakers);
  const parts = [
    ...(tv ? [tvWord(tv, t)] : []),
    // the legacy line cuts only the dash: a full-width ampersand stays in it, where the box and the tile make it plain
    ...(tv?.state === 'on' && tv.summarySource ? [tv.summarySource] : []),
    ...(speakers.length === 0
      ? []
      : playing > 0
        ? [playingWord(playing, tv !== null, t)]
        : [t('media.summaryIdle', {count: speakers.length})]),
  ];
  return parts.join(' · ');
}

/**
 * The word under Media in the phone's More sheet: the legacy `moreLines`, which says the television's state and the speakers that
 * play, without the input the pane's sub-line names, and "Nothing playing" when that says nothing. It counts what Home Assistant says.
 */
export function mediaBrief({tv, speakers}: MediaInputs, t: Translate): string {
  const playing = playingCount(speakers);
  const parts = [...(tv ? [tvWord(tv, t)] : []), ...(playing > 0 ? [playingWord(playing, tv !== null, t)] : [])];
  return parts.join(' · ') || t('media.nothingPlaying');
}

function tvTile(tv: TvView, t: Translate): MediaTileView {
  return {
    key: 'tv',
    kind: 'tv',
    icon: 'tv',
    title: tv.name,
    sheetTitle: tv.name,
    description: t('media.opensControls'),
    // not the muted status: the phone's tile never said it
    subLine: tv.available && tv.on ? `${t('media.on')}${tv.sourceLabel ? ` · ${tv.sourceLabel}` : ''}` : tv.status,
    track: false,
    on: tv.on,
    picture: null,
    control: {
      kind: 'power',
      on: tv.on,
      label: tv.powerLabel,
      disabled: !tv.available,
      tv: {id: tv.id, wakeButton: tv.wakeButton},
    },
  };
}

function speakerTile(speaker: SpeakerView, t: Translate): MediaTileView {
  return {
    key: speaker.id,
    kind: 'speaker',
    icon: 'spk',
    title: speaker.room,
    sheetTitle: t('media.speakers'),
    description: t('media.opensControls'),
    subLine: speaker.loaded ? `${speaker.title}${speaker.artist ? ` · ${speaker.artist}` : ''}` : speaker.subLine,
    track: speaker.loaded,
    on: speaker.playing,
    picture: speaker.picture,
    control: {
      kind: 'play',
      playing: speaker.playing,
      label: speaker.playPause.label,
      disabled: !speaker.playPause.enabled,
      icon: speaker.playPause.icon,
      speaker: {id: speaker.id, room: speaker.room},
      volume: speaker.volume,
    },
  };
}

export function mediaModel(inputs: MediaInputs, deps: MediaModelDeps): MediaViewModel {
  const {t} = deps;
  const tv = inputs.tv ? tvView(inputs.tv, deps) : null;
  const speakers = inputs.speakers.map(speaker => speakerView(speaker, deps));
  const playing = playingCount(inputs.speakers);
  return {
    summary: summaryOf(inputs, t),
    tv,
    speakers,
    speakersLine: !speakers.length
      ? t('media.noneFound')
      : playing > 0
        ? playingWord(playing, false, t)
        : t('media.nothingPlaying'),
    tiles: [...(tv ? [tvTile(tv, t)] : []), ...speakers.map(speaker => speakerTile(speaker, t))],
    labels: {speakers: t('media.speakers'), noDevices: t('media.noDevices'), noSpeakers: t('media.playersHint')},
  };
}
