// <hp-live-pill>: the header's pill: nothing when nothing runs and nothing needs a look; an amber or red "N things need attention" pill; else the first activity's
// ring and words, the others as ring bubbles and a "!" bubble for a problem, or a finished activity's check for ten minutes. A tap opens the Status popup.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing `liveModel`'s pill in the legacy `laPill()`'s markup; it keeps the model's `LiveState` between readings
// (the reducer's state lives in the element, as `laSeen` and `laDone` lived in the legacy panel) and tells the shell how many activities run (an event up).
// Must not: read an entity or the clock but through `LiveReading`, word a string, or open the popup itself (the shell does).
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';
import type {PillText} from './activities.ts';
import {INITIAL_LIVE_STATE, type LiveState} from './done.ts';
import ownCss from './live-pill.element.css?inline';
import type {AttentionView, PillView, RingView} from './model.ts';
import {LiveReading} from './reading.ts';
import {STATUS_SHEET} from './sheets.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetDismissEvent, SheetRequestEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import '../../ui/ring.ts'; // defines <hp-ring>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The pill's ring and a bubble's, in pixels. */
const MAIN_RING = 34;
const BUBBLE_RING = 36;

/** How many activities run and how many checks need attention, sent up whenever either changes: the shell slims the weather chip while an activity runs, and tells the guest the count. */
export class LiveActivitiesEvent extends CustomEvent<{count: number; attention: number}> {
  constructor(count: number, attention: number) {
    super('live-activities', {bubbles: true, composed: true, detail: {count, attention}});
  }
}

const levelColor = (level: AttentionView['level']) => `var(--${level})`;

export class LivePill extends LitElement {
  static override properties = {open: {type: Boolean}};
  /** Bound by the shell to whether it keeps the Status checks open: the popup is on screen, which `aria-expanded` says. */
  declare open: boolean;

  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  private readonly appearance = new AppearanceConsumer(this);
  private readonly reading = new LiveReading(this, {active: () => true});
  private state: LiveState = INITIAL_LIVE_STATE;
  private pill: PillView | null = null;
  private told = '';

  constructor() {
    super();
    this.open = false;
  }

  protected override willUpdate(): void {
    const model = this.reading.model(this.state, this.appearance.value?.compact === true);
    if (!model) return;
    this.state = model.state;
    this.pill = model.pill;
    const attention = model.popup.status.items.length;
    const told = `${model.activityCount}/${attention}`;
    if (told !== this.told) {
      this.told = told;
      this.dispatchEvent(new LiveActivitiesEvent(model.activityCount, attention));
    }
  }

  // with nothing left to show, an open popup closes, as the legacy header closed it
  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (!this.pill && this.open) this.dispatchEvent(new SheetDismissEvent(STATUS_SHEET));
  }

  protected override render() {
    const {pill} = this;
    if (!pill) return nothing;
    return html`<button
      type="button"
      class="chip attchip lap"
      aria-haspopup="dialog"
      aria-expanded=${this.open}
      @click=${this.onTap}
    >
      ${pill.kind === 'attention' ? this.attention(pill) : this.main(pill)}${
        pill.kind === 'activity' ? pill.bubbles.map(bubble => this.bubble(bubble)) : nothing
      }${pill.kind !== 'attention' && pill.attention ? this.attentionBubble(pill.attention) : nothing}
    </button>`;
  }

  // a problem alone: the pill is the problem, in amber or red
  private attention({level, text}: AttentionView) {
    return html`<span class="lmain latt" style=${styleMap({'--ac': levelColor(level)})}
      ><span class="lwarn"><b>!</b></span
      ><span>${text}</span></span
    >`;
  }

  private main(pill: Exclude<PillView, {kind: 'attention'}>) {
    if (pill.kind === 'done')
      return html`<span class="lmain" style="--ac:var(--c-ev)"
        ><span class="lok">${ico('check', 18)}</span><span>${pill.text}</span>${
          pill.time === null ? nothing : html`<span class="ll">${pill.time}</span>`
        }</span
      >`;
    return html`<span class="lmain ${classMap({tint: pill.tint})}" style=${styleMap({'--ac': pill.ring.color})}
      >${this.ring(pill.ring, MAIN_RING)}<span class="sr">${pill.aria}</span
      ><span class="lsay" aria-hidden="true">${this.say(pill.text)}</span></span
    >`;
  }

  private say({label, value, extra}: PillText) {
    return html`${label === null ? nothing : html`<span class="ll">${label}</span>`}${
      value === null ? nothing : html`<span class="lv">${value}</span>`
    }${extra === null ? nothing : html`<i class="lsep"></i><span class="lv">${extra}</span>`}`;
  }

  private ring({progress, color, icon}: RingView, size: number) {
    return html`<hp-ring .value=${progress} .color=${color} .size=${size} .icon=${icon}></hp-ring>`;
  }

  private bubble(bubble: RingView & {aria: string}) {
    return html`<span class="lbub">${this.ring(bubble, BUBBLE_RING)}<span class="sr">${bubble.aria}</span></span>`;
  }

  private attentionBubble({level, text}: AttentionView) {
    return html`<span class="lbub lwarn" style=${styleMap({'--ac': levelColor(level)})}
      ><b aria-hidden="true">!</b><span class="sr">${text}</span></span
    >`;
  }

  // a tap opens the popup, a second one closes it, as the legacy chip toggled it; the tap goes no further, so the frame's
  // tap-outside rule leaves the settings popup open, as the legacy chip's listener did
  private readonly onTap = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(this.open ? new SheetDismissEvent(STATUS_SHEET) : new SheetRequestEvent(STATUS_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-live-pill': LivePill;
  }
}

if (!customElements.get('hp-live-pill')) customElements.define('hp-live-pill', LivePill);
