// <hp-speaker-pod>: one speaker in the Media pane: the cover or the speaker icon, the room and the track, the volume slider with its − and +, play.
// Pattern: humble object (Meszaros) over the model's `SpeakerView`; a tap holds the value it asks for in the panel's overlay store and
// runs the feature's command (ADR 0023); the slider holds the level on `input` and the − and + taps hold theirs, and both go through
// `debounce(450)`, so a drag or a burst is one `volume_set` at the last level. A continuous value is a slider (Apple's HIG, Sliders).
// A send still waiting is cancelled in `disconnectedCallback` and its level released, so a pod that leaves the document sends nothing and
// never shows an unsent level when it comes back; connecting arms nothing (a tap does).
// Must not: read an entity or the store's state (the pane hands it `speaker`), word a string, or send a level per tap.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';
import {K, speakerPlayPause, speakerVolume} from './commands.ts';
import type {SpeakerView} from './model.ts';
import podOwn from './speaker-pod.element.css?inline';
import {debounce} from '../../core/timing.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {ico} from '../../ui/icons.ts';
import {stepBy} from '../../ui/steps.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** How long the pod waits for the slider or the taps to stop before it sends the level: the legacy `mpVol`'s 450 ms. */
const VOLUME_DEBOUNCE_MS = 450;

/** A tap on the − or +: five percent, as the legacy stepper; the level stays in 0 to 1 at two decimals. */
const VOLUME_STEP = 0.05;

export class SpeakerPod extends LitElement {
  static override properties = {
    speaker: {attribute: false},
  };
  /** The speaker as the pane's model says it, held values included. */
  declare speaker: SpeakerView | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in speaker-pod.element.css.
  static override styles = [common, unsafeCSS(forShadow(podOwn))];

  // the catalog for the runner's toasts, and no entity: `ids` is empty, so no state change reaches the pod
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  // one wait per pod: the last level of a burst is the one sent, for the speaker it was tapped on (the legacy `volT` was one wait
  // for the panel, so a tap on another speaker dropped this one's level)
  private readonly sendVolume = debounce((speaker: SpeakerView, level: number) => {
    this.waiting = undefined;
    void this.commands.run(speakerVolume(speaker, level));
  }, VOLUME_DEBOUNCE_MS);
  /** The speaker whose level waits to be sent; its hold is released if the pod leaves the document first. */
  private waiting: string | undefined;

  constructor() {
    super();
    // `glass` comes from the shell as a host attribute the pod's rules test
    new AppearanceConsumer(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.sendVolume.cancel();
    if (this.waiting) this.optimistic.release(K.volume(this.waiting));
    this.waiting = undefined;
  }

  protected override render() {
    const speaker = this.speaker;
    if (!speaker) return nothing;
    const {volume, playPause} = speaker;
    return html`<div class=${classMap({player: true, on: speaker.playing})}>
      <span class="pic"
        >${speaker.picture ? html`<img src=${speaker.picture} alt="" loading="lazy" />` : ico('spk', 34)}</span
      >
      <div class="tx">
        <h3>${speaker.room}</h3>
        ${speaker.title ? html`<div class="tr" translate="no">${speaker.title}</div>` : nothing}
        <div class="sb" translate="no">${speaker.subLine}</div>
      </div>
      ${
        volume
          ? html`<div class="vol">
              <button
                type="button"
                class="step"
                aria-label=${volume.downLabel}
                ?disabled=${volume.level <= 0}
                @click=${this.onDown}
              >
                −
              </button>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label=${volume.label}
                aria-valuetext=${volume.text}
                .value=${String(volume.percent)}
                style=${styleMap({'--v': `${volume.percent}%`})}
                @input=${this.onInput}
                @change=${this.onRelease}
              />
              <button
                type="button"
                class="step"
                aria-label=${volume.upLabel}
                ?disabled=${volume.level >= 1}
                @click=${this.onUp}
              >
                +
              </button>
              <b class="vv num">${volume.text}</b>
            </div>`
          : nothing
      }
      <button
        type="button"
        class=${classMap({play: true, on: speaker.playing})}
        aria-label=${playPause.label}
        ?disabled=${!playPause.enabled}
        @click=${this.onPlay}
      >
        ${ico(playPause.icon, 26)}
      </button>
    </div>`;
  }

  // the level shows at once (the hold draws the pane again) and is sent once the finger or the taps stop
  private hold(level: number): void {
    if (!this.speaker) return;
    this.optimistic.hold(K.volume(this.speaker.id), level);
    this.waiting = this.speaker.id;
  }

  private step(level: number): void {
    if (!this.speaker) return;
    this.hold(level);
    this.sendVolume(this.speaker, level);
  }

  private readonly onDown = (): void => this.stepFrom(-VOLUME_STEP);
  private readonly onUp = (): void => this.stepFrom(VOLUME_STEP);
  private stepFrom(delta: number): void {
    if (this.speaker?.volume) this.step(stepBy(this.speaker.volume.level, delta, 0, 1));
  }

  // a slider's level, in whole percents, as the level the player takes
  private levelOf(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value) / 100;
  }

  // `input` fires all along a drag: it only shows the level; the send waits for the finger to rest (`change`, and the debounce)
  private readonly onInput = (e: Event): void => this.hold(this.levelOf(e));

  private readonly onRelease = (e: Event): void => this.step(this.levelOf(e));

  private readonly onPlay = (): void => {
    if (!this.speaker) return;
    const play = !this.speaker.playing;
    this.optimistic.hold(K.state(this.speaker.id), play ? 'playing' : 'paused');
    void this.commands.run(speakerPlayPause(this.speaker, play));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-speaker-pod': SpeakerPod;
  }
}

if (!customElements.get('hp-speaker-pod')) customElements.define('hp-speaker-pod', SpeakerPod);
