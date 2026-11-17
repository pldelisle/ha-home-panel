// <hp-idle-screen>: what the idle overlay shows: the clock, with the smart stack's card beside it while the stack has one, the
// whole block drifting a little on every tick of the clock.
// Pattern: a humble composition (Meszaros, xUnit Test Patterns) at the composition root, as Home's pane is (ADR 0017): the shell
// imports `features/clock` and `features/stack` and lays them out here; neither imports the other. The drift is `drift`'s, a pure rule.
// Must not: read an entity, word anything, decide when the panel is idle (the shell's `IdleTimer` does), or stop the tap that wakes it.
import {LitElement, html, unsafeCSS, type PropertyValues} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';
import {drift} from './drift.ts';
import idleOwn from './idle-screen.element.css?inline';
import type {IdleState} from './idle-timer.ts';
import {CLOCK_TICK_MS} from '../features/clock/index.ts'; // defines <hp-clock>
import '../features/stack/index.ts'; // defines <hp-smart-stack>
import {TickController} from '../ui/controllers/tick.ts';
import type {EmptyEvent} from '../ui/events.ts';
import {common} from '../ui/styles/index.ts';

export class IdleScreen extends LitElement {
  static override properties = {
    state: {},
    stackShown: {state: true},
  };
  /** The idle timer's state: the clock shows while `idle` and while `waking`, when the overlay fades out. */
  declare state: IdleState;
  /** The stack has a card: the clock and the card sit side by side. */
  declare private stackShown: boolean;

  // The element's own rules, the drifting block and the side-by-side layout, are in idle-screen.element.css.
  static override styles = [common, unsafeCSS(idleOwn)];

  // when the clock last started to show, and this showing's seed: the drift's tick is the clock ticks since then
  private since = 0;
  private seed = 0;

  constructor() {
    super();
    this.state = 'active';
    this.stackShown = false;
    // the drift moves on the clock's tick; the clock redraws itself on its own
    new TickController(this, CLOCK_TICK_MS, () => this.state === 'idle');
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('state') && this.state === 'idle') {
      this.since = Date.now();
      this.seed = Math.floor(Math.random() * 2 ** 32);
    }
  }

  protected override render() {
    const shows = this.state !== 'active';
    const {x, y} = drift(Math.floor((Date.now() - this.since) / CLOCK_TICK_MS), this.seed);
    return html`<div class="iwrap" id="iwrap" style=${styleMap(shows ? {transform: `translate(${x}px,${y}px)`} : {})}>
      <div id="iss" class=${classMap({ss: this.stackShown})}>
        <div class="ssc" id="iclk"><hp-clock .active=${shows} .beside=${this.stackShown}></hp-clock></div>
        <div class="ssk" id="istk" ?hidden=${!this.stackShown} @hp-empty=${this.onStackEmpty}>
          <hp-smart-stack .mode=${'idle'}></hp-smart-stack>
        </div>
      </div>
    </div>`;
  }

  // the stack says when it has a card; the event stops here, the layout is this screen's
  private readonly onStackEmpty = (e: EmptyEvent): void => {
    e.stopPropagation();
    this.stackShown = !e.detail.empty;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-idle-screen': IdleScreen;
  }
}

if (!customElements.get('hp-idle-screen')) customElements.define('hp-idle-screen', IdleScreen);
