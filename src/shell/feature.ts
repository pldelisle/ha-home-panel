// The shape of a plug-in: what the frame needs to know about one subject of the panel, as data.
// Pattern: plug-in (Fowler, Patterns of Enterprise Application Architecture, Plugin): configuration, not code, decides
// which implementation of a subject is linked, and the registry (features.ts) is the list of these descriptors.
// Must not: hold state, import the guest, a feature or the shell's elements, or draw: `pane` only returns a template.
import type {TemplateResult} from 'lit';
import type {MessageKey} from '../core/i18n/en.ts';
import type {PanelStore} from '../core/store.ts';
import type {IconName} from '../ui/icons.ts';

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
  /** The pane's content: a feature's element, or the markup the guest still fills. */
  pane: () => TemplateResult;
}
