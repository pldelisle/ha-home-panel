// <hp-speaker-pod>: one speaker in the Media pane: the cover or the speaker icon, the room and the track, the volume stepper, play.
// Pattern: humble object (Meszaros) over the model's `SpeakerView`; a tap holds the value it asks for in the panel's overlay store and
// runs the feature's command (ADR 0023); the stepper's taps go through `debounce(450)`, so a burst is one `volume_set` at the last level.
// A send still waiting is cancelled in `disconnectedCallback`, so a pod that leaves the document sends nothing; connecting arms nothing (a tap does).
// Must not: read an entity or the store's state (the pane hands it `speaker`), word a string, or send a level per tap.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {K, speakerPlayPause, speakerVolume} from './commands.ts';
import type {SpeakerView} from './model.ts';
import podOwn from './speaker-pod.element.css?inline';
import {debounce} from '../../core/timing.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** How long the stepper waits for the taps to stop before it sends the level: a copy of the legacy `mpVol`'s 450 ms, until #218 deletes it. */
const VOLUME_DEBOUNCE_MS = 450;

// the stepper's two glyphs, the same in every language: a screen reader says the buttons' labels, which the catalog words
const MINUS = '−';
const PLUS = '+';

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
  // one wait per pod: the last level of a burst is the one sent, for the speaker it was tapped on
  private readonly sendVolume = debounce((speaker: SpeakerView, level: number) => {
    void this.commands.run(speakerVolume(speaker, level));
  }, VOLUME_DEBOUNCE_MS);

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the pod's rules test
    new AppearanceConsumer(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.sendVolume.cancel();
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
          ? html`<div class="vol" role="group" aria-label=${volume.label}>
              <button type="button" aria-label=${volume.downLabel} ?disabled=${volume.atMin} @click=${this.onDown}>
                ${MINUS}
              </button>
              <div class="sv"><b class="num">${volume.text}</b><small>${volume.caption}</small></div>
              <button type="button" aria-label=${volume.upLabel} ?disabled=${volume.atMax} @click=${this.onUp}>
                ${PLUS}
              </button>
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

  // the level shows at once (the hold draws the pane again) and is sent once the taps stop
  private step(level: number): void {
    if (!this.speaker) return;
    this.optimistic.hold(K.volume(this.speaker.id), level);
    this.sendVolume(this.speaker, level);
  }

  private readonly onDown = (): void => {
    if (this.speaker?.volume) this.step(this.speaker.volume.down);
  };

  private readonly onUp = (): void => {
    if (this.speaker?.volume) this.step(this.speaker.volume.up);
  };

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
