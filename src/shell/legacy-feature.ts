// The descriptor of a subject the guest still draws: the pane's header and the host containers it fills, as markup.
// Pattern: strangler fig (Fowler, Strangler Fig Application): the registry's entry exists before the feature does, and
// a move replaces this call with the feature's own descriptor. The host containers are one static string that Lit
// parses once and never touches again, so every id the guest writes into stays a plain attribute.
// Must not: bind a value inside a host container, outlive its subject's move, or hold what the guest answers.
import {html} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {en, type MessageKey} from '../core/i18n/en.ts';
import {ico, type IconName} from '../ui/icons.ts';
import type {FeatureDescriptor, FeatureKey} from './feature.ts';

export interface LegacyParts {
  icon: IconName;
  color: string;
  phoneBar: boolean;
  shortTitle?: MessageKey;
  header: {
    /** The heading's id, when the guest rewrites its text (the Car pane names the car). */
    h2Id?: string;
    /** The id of the line under the heading, which the guest writes. */
    subId: string;
    /** The compact header of the summary panes (`ph cph`). */
    compact?: boolean;
    /** Markup after the heading inside the header: the Lights pane's Arrange and Reset order buttons. */
    extra?: string;
  };
  /** The host containers, in order: markup the guest fills and moves cards and detail panels into. */
  hosts: readonly string[];
}

export function legacyFeature<K extends FeatureKey>(key: K, parts: LegacyParts): FeatureDescriptor {
  const title: MessageKey = `${key}.title`;
  const {header, color, icon} = parts;
  const hosts = parts.hosts.join('');
  return {
    key,
    title,
    shortTitle: parts.shortTitle,
    icon,
    color,
    phoneBar: parts.phoneBar,
    available: ({guest}) => guest.availability()[key] ?? true,
    summary: ({guest}) => guest.moreLine(key),
    // The heading's words are English, as the guest writes them: the French layer translates them with the rest of the
    // pane. One line, as the class wrote it: a text node between the header's children is a box the baselines would show.
    // prettier-ignore
    pane: () => html`<div class="ph${header.compact ? ' cph' : ''}"><span class="badge" style="--acc:${color}">${ico(icon, 26)}</span><div class="grow"><h2 id=${ifDefined(header.h2Id)}>${en[title]}</h2><div class="sub" id=${header.subId}></div></div>${unsafeHTML(header.extra ?? '')}</div>${unsafeHTML(hosts)}`,
  };
}
