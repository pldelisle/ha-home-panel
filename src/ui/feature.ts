// The shape of a plug-in: what the frame needs to know about one subject of the panel, as data.
// Pattern: plug-in (Fowler, Patterns of Enterprise Application Architecture, Plugin): configuration, not code, decides
// which implementation of a subject is linked, and the registry (features.ts) is the list of these descriptors.
// Lives in the kit so a feature can type its descriptor without importing the shell (ADR 0017); the registry is the shell's.
// Must not: hold state, import the guest, a feature or the shell's elements, or draw: `pane` only returns a template.
import type {TemplateResult} from 'lit';
import type {MessageKey} from '../core/i18n/en.ts';
import type {PanelStore} from '../core/store.ts';
import type {IconName} from './icons.ts';

/** The ten subjects of the panel, in rail order. */
export type FeatureKey =
  'home' | 'lights' | 'climate' | 'weather' | 'car' | 'energy' | 'air' | 'media' | 'cams' | 'auto';

/** What the guest answers while it still draws a subject; a descriptor reads it through `FeatureEnv`. */
export interface GuestAnswers {
  /** Which subjects this house has something for (false: it lacks them); a missing key means no opinion. */
  availability(): Partial<Record<FeatureKey, boolean>>;
  /** The word under a section in the phone's More sheet, in the panel's language, or null when the section has none. */
  moreLine(key: FeatureKey): string | null;
}

/** What a descriptor may read: this panel's store and, until the subject is a feature of its own, the guest's answers. */
export interface FeatureEnv {
  readonly store: PanelStore;
  readonly guest: GuestAnswers;
  /** Whether the sheet host has this element's sheet open: a pane binds it to its sheet's `open` (ADR 0021). */
  sheetOpen(id: string): boolean;
}

export interface FeatureDescriptor {
  key: FeatureKey;
  /** The rail label, the pane heading and the More list. */
  title: MessageKey;
  /** The phone's fifth slot when it holds this section, for a title that does not fit ('auto.short' is "Rules"). */
  shortTitle?: MessageKey;
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
   * The id of the element sheet that shows this subject's detail (`weather.detail`): inline in the pane on a tablet, over the screen on
   * a phone, whichever tab is shown (the pane stays behind the sheet and the tab is not changed).
   */
  detailSheet?: string;
  /** The pane's content: a feature's element, or the markup the guest still fills. */
  pane: (env: FeatureEnv) => TemplateResult;
}
