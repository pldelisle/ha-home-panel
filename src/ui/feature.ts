// The shape of a plug-in: what the frame needs to know about one subject of the panel, as data.
// Pattern: plug-in (Fowler, Patterns of Enterprise Application Architecture, Plugin): configuration, not code, decides
// which implementation of a subject is linked, and the registry (features.ts) is the list of these descriptors.
// Lives in the kit so a feature can type its descriptor without importing the shell (ADR 0017); the registry is the shell's.
// Must not: hold state, import a feature or the shell's elements, or draw: `pane` only returns a template.
import type {TemplateResult} from 'lit';
import type {MessageKey} from '../core/i18n/en.ts';
import type {PanelStore} from '../core/store.ts';
import type {IconName} from './icons.ts';

/** The ten subjects of the panel, in rail order. */
export type FeatureKey =
  'home' | 'lights' | 'climate' | 'weather' | 'car' | 'energy' | 'air' | 'media' | 'cams' | 'auto';

/** What a descriptor may read: this panel's store and the sheet host's answers. */
export interface FeatureEnv {
  readonly store: PanelStore;
  /** Whether the sheet host has this element's sheet open: a pane binds it to its sheet's `open` (ADR 0021). */
  sheetOpen(id: string): boolean;
  /** What the open sheet was asked to show (the tile of a history: `{key}`), or undefined when it is not the sheet open. */
  sheetDetail(id: string): unknown;
  /** The area of the room view shown (ADR 0039), or null while a section is: a feature draws its tiles for that room only. */
  readonly room: string | null;
  /** The rooms of the house, by area and name, sorted as the sidebar lists them (ADR 0039): Home's Rooms row draws them where the sidebar does not. */
  readonly rooms: readonly {readonly areaId: string; readonly name: string}[];
  /** Whether the Liquid Glass sidebar is drawn and lists the rooms, so Home draws no Rooms row (the one rule `renderRail` draws the sidebar's group by). */
  readonly sidebarRooms: boolean;
}

/** A subject's part of a room view (ADR 0039): which areas it has tiles in, and its tiles for one of them. */
export interface RoomPart {
  /** The areas this subject has a tile in, by area id: asked on every change, as `available` is. */
  areas(env: FeatureEnv): readonly string[];
  /** Its tiles for one area; its element asks for the feature's own sheets as the pane does. */
  part(env: FeatureEnv, areaId: string): TemplateResult;
  /** A short reading for the room's header ("21°", "45 %"), or null; the Climate and Air tickets fill it. */
  chip?(env: FeatureEnv, areaId: string): string | null;
}

export interface FeatureDescriptor {
  key: FeatureKey;
  /** The rail label, the pane heading and the More list. */
  title: MessageKey;
  icon: IconName;
  /** A colour token such as `var(--m-blue)`. */
  color: string;
  /** One of the four tabs of the phone's bar; the others sit under More. */
  phoneBar: boolean;
  /** Whether the tab is shown; absent means always. */
  available?: (env: FeatureEnv) => boolean;
  /** The word under the section in More; absent or null means none. */
  summary?: (env: FeatureEnv) => string | null;
  /**
   * The id of the element sheet that shows this subject's detail (`air.detail`): inline in the pane on a tablet, over the screen on
   * a phone, whichever tab is shown (the pane stays behind the sheet and the tab is not changed).
   */
  detailSheet?: string;
  /**
   * The ids of the other element sheets this subject's pane draws over the screen (`weather.history`): the pane stays in the page
   * behind them, whichever tab is shown, so the tab does not change.
   */
  overSheets?: readonly string[];
  /** This subject's part of a room view (ADR 0039); absent means it has none. */
  room?: RoomPart;
  /** The pane's content: a feature's element. */
  pane: (env: FeatureEnv) => TemplateResult;
}
