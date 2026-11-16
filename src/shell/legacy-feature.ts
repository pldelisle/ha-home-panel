// The descriptor of a subject the guest still draws: its pane's `<hp-pane-header>` and the host containers the guest fills.
// Pattern: strangler fig (Fowler, Strangler Fig Application): the registry's entry exists before the feature does, and a
// move replaces this call with the feature's own descriptor. What the guest writes (the sub-line) is static markup in the
// header's slot, light DOM in the shell's root, and the header's heading comes from the catalog.
// Must not: bind a value inside a slotted node or a host container, outlive its subject's move, or hold what the guest answers.
import {html, unsafeStatic} from 'lit/static-html.js';
import type {MessageKey} from '../core/i18n/en.ts';
import type {FeatureDescriptor, FeatureKey} from '../ui/feature.ts';

export interface LegacyParts extends Pick<FeatureDescriptor, 'icon' | 'color' | 'phoneBar' | 'shortTitle'> {
  header: {
    /** The id of the line under the heading, which the guest writes. */
    subId: string;
    /** Markup for the header's `actions` slot, which carries `slot="actions"`: the Lights pane's Arrange and Reset order buttons. */
    actions?: string;
  };
  /** The host containers, in order: markup the guest fills and moves cards and detail panels into. */
  hosts: readonly string[];
}

/** A subject whose heading the catalog holds as `<key>.title`: what the guest still draws. Security's is `security.title`, and a move keeps the key out by itself. */
type TitledKey = {[K in FeatureKey]: `${K}.title` extends MessageKey ? K : never}[FeatureKey];

export function legacyFeature<K extends TitledKey>(key: K, parts: LegacyParts): FeatureDescriptor {
  const title: MessageKey = `${key}.title`;
  const {header, color, icon} = parts;
  // The tag's start and the rest are static, so Lit parses them once and binds only the header's three properties; every id
  // stays a plain attribute, and one line, as the class wrote it: a text node between the pane's children is a box the baselines would show.
  const start = unsafeStatic('<hp-pane-header');
  const rest = unsafeStatic(
    `<div slot="sub" id="${header.subId}"></div>${header.actions ?? ''}</hp-pane-header>${parts.hosts.join('')}`,
  );
  return {
    key,
    title,
    shortTitle: parts.shortTitle,
    icon,
    color,
    phoneBar: parts.phoneBar,
    available: ({guest}) => guest.availability()[key] ?? true,
    summary: ({guest}) => guest.moreLine(key),
    pane: ({store}) => html`${start} icon=${icon} color=${color} heading=${store.t(title)}>${rest}`,
  };
}
