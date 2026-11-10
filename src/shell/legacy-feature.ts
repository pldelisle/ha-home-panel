// The descriptor of a subject the guest still draws: its pane's `<hp-pane-header>` and the host containers the guest fills.
// Pattern: strangler fig (Fowler, Strangler Fig Application): the registry's entry exists before the feature does, and a
// move replaces this call with the feature's own descriptor. What the guest writes (the sub-line, the Car heading) is static
// markup in the header's slots, light DOM in the shell's root, and the header's heading comes from the catalog.
// Must not: bind a value inside a slotted node or a host container, outlive its subject's move, or hold what the guest answers.
import {ifDefined} from 'lit/directives/if-defined.js';
import {html, unsafeStatic} from 'lit/static-html.js';
import {en, type MessageKey} from '../core/i18n/en.ts';
import type {FeatureDescriptor, FeatureKey} from './feature.ts';

export interface LegacyParts extends Pick<FeatureDescriptor, 'icon' | 'color' | 'phoneBar' | 'shortTitle'> {
  header: {
    /**
     * The id of a heading the guest writes (the Car pane names the car). It is drawn in the header's `title` slot, in English
     * as the guest writes it, for the French layer to translate; without one the heading is the catalog's.
     */
    h2Id?: string;
    /** The id of the line under the heading, which the guest writes. */
    subId: string;
    /** The summary panes' header, which only the phone shows (`cph`). */
    compact?: boolean;
    /** Markup for the header's `actions` slot, which carries `slot="actions"`: the Lights pane's Arrange and Reset order buttons. */
    actions?: string;
  };
  /** The host containers, in order: markup the guest fills and moves cards and detail panels into. */
  hosts: readonly string[];
}

export function legacyFeature<K extends FeatureKey>(key: K, parts: LegacyParts): FeatureDescriptor {
  const title: MessageKey = `${key}.title`;
  const {header, color, icon} = parts;
  // The tag's start and the rest are static, so Lit parses them once and binds only the header's three properties; every id
  // stays a plain attribute, and one line, as the class wrote it: a text node between the pane's children is a box the baselines would show.
  const start = unsafeStatic(`<hp-pane-header${header.compact ? ' class="cph"' : ''}`);
  const heading = header.h2Id ? `<h2 slot="title" id="${header.h2Id}">${en[title]}</h2>` : '';
  const rest = unsafeStatic(
    `${heading}<div slot="sub" id="${header.subId}"></div>${header.actions ?? ''}</hp-pane-header>${parts.hosts.join('')}`,
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
    pane: ({store}) =>
      html`${start} icon=${icon} color=${color} heading=${ifDefined(header.h2Id ? undefined : store.t(title))}>${rest}`,
  };
}
