// <hp-light-sheet>: a room's sheet: power and Done in the header, the two tall pills, the Auto brightness, Auto colour and Night rows, the bulbs' chips and
// "Linked with", whose row pushes the list of rooms (<hp-link-picker>) in the body's place.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `SheetView`, events up (Lit docs, Events). It draws the kit's
// sheet chrome (sheet.css) itself rather than <hp-sheet>, whose badge and ✕ cannot be the legacy power button and Done (README, the sheet).
// Must not: send a call or save a link (the pane does), read the store, hold a string the household reads, or close itself (it asks).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {styleMap} from 'lit/directives/style-map.js';
import {AreaToggleEvent} from './light-tile.ts';
import type {SheetView} from './model.ts';
import {ROOM_SHEET} from './sheets.ts';
import './light-slider.ts'; // defines <hp-light-slider>
import './link-picker.ts'; // defines <hp-link-picker>
import sheetOwn from './light-sheet.element.css?inline';
import rowsCss from './sheet-rows.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SwipeToClose} from '../../ui/controllers/swipe-to-close.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {lens} from '../../ui/lens.ts';
import {common, motion, sheet} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import '../../ui/switch.ts'; // defines <hp-switch>

/** What a row or a chip of the sheet asks: Auto brightness, Auto colour or Night the other way, or one bulb switched. */
export type SheetIntent = {kind: 'brightness'} | {kind: 'colour'} | {kind: 'night'} | {kind: 'bulb'; id: string};

/** A row of the sheet's switches. */
type ModeKind = 'brightness' | 'colour' | 'night';
/** Each row's `data-l`, the hook the tests and the panel's styles find it by. */
const MODE_HOOK: Record<ModeKind, string> = {brightness: 'abr', colour: 'acol', night: 'night'};

export class SheetIntentEvent extends CustomEvent<SheetIntent> {
  constructor(intent: SheetIntent) {
    super('sheet-intent', {bubbles: true, composed: true, detail: intent});
  }
}

/** The words a pill paints under the finger, in the panel's language: brightness and colour temperature. */
export interface SliderWords {
  br: (value: number) => string;
  ct: (value: number) => string;
}

export class LightSheet extends LitElement {
  static override properties = {
    view: {attribute: false},
    words: {attribute: false},
    doneLabel: {},
    picking: {state: true},
  };
  declare view: SheetView | undefined;
  declare words: SliderWords | undefined;
  /** Done's label, in the panel's language. */
  declare doneLabel: string;
  /** "Linked with" was tapped: the list of rooms is in the body's place until Back or a pick. */
  declare private picking: boolean;

  // the kit's chrome and keyframes, the feature's grouped rows, then the element's own rules (light-sheet.element.css)
  static override styles = [common, motion, sheet, unsafeCSS(forShadow(rowsCss)), unsafeCSS(forShadow(sheetOwn))];

  private readonly appearance = new AppearanceConsumer(this);
  // on a phone, dragged down by its grabber or its title to close, as the legacy sheet was; a press on a control is the control's
  private readonly swipe = new SwipeToClose(this, {
    enabled: () => this.appearance.value?.compact === true,
    close: () => this.dismiss(),
    handle: '.grab, .ph > .grow',
  });

  constructor() {
    super();
    this.view = undefined;
    this.words = undefined;
    this.doneLabel = '';
    this.picking = false;
  }

  // Done takes focus as the sheet opens, as the legacy sheet's Close did, so a keyboard is inside the sheet at once
  protected override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('.ldone')?.focus();
  }

  protected override render() {
    const v = this.view;
    if (!v) return nothing;
    const tint = v.power.tint || 'var(--warn)';
    return html`<div class="sheet" id="sh-light" @click=${this.onBackdrop}>
        <div
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lshh"
          style=${styleMap({'--lc': tint})}
          @pointerdown=${this.swipe.onPointerDown}
          @pointermove=${this.swipe.onPointerMove}
          @pointerup=${this.swipe.onPointerEnd}
          @pointercancel=${this.swipe.onPointerEnd}
        >
          <div class="grab" aria-hidden="true"></div>
          <div class="ph">
            <button
              type="button"
              class="lpwr"
              id="lshpwr"
              role="switch"
              aria-checked=${v.power.on ? 'true' : 'false'}
              aria-label=${v.power.label}
              data-l="area"
              data-a=${v.key}
              ?disabled=${!v.power.available}
              style=${styleMap({'--lc': tint})}
              @click=${this.onPower}
            >
              ${ico('lpow', 24)}
            </button>
            <div class="grow">
              <h2 id="lshh">${v.title}</h2>
              <div class="sub" id="lshsub">${v.sub}</div>
            </div>
            <button class="close ldone" type="button" @click=${this.dismiss}>${this.doneLabel}</button>
          </div>
          <div class="lsbody" id="lsheet">
            ${
              this.picking
                ? html`<hp-link-picker .picker=${v.picker} @picker-back=${this.onBack}></hp-link-picker>`
                : this.renderBody(v)
            }
          </div>
        </div>
      </div>
      ${lens}`;
  }

  private renderBody(v: SheetView) {
    const {words} = this;
    return html`<div class="lpills">
        <hp-light-slider
          .kind=${'br'}
          .slider=${v.brightness}
          .off=${v.brightness.off}
          .word=${words?.br ?? String}
        ></hp-light-slider
        >${
          v.colour
            ? html`<hp-light-slider
                .kind=${'ct'}
                .slider=${v.colour}
                .night=${v.colour.night}
                .gradient=${v.colour}
                .word=${words?.ct ?? String}
              ></hp-light-slider>`
            : nothing
        }
      </div>
      ${v.modes ? this.renderModes(v.modes) : nothing}${v.bulbs ? this.renderBulbs(v.bulbs) : nothing}${
        v.link.show ? this.renderLink(v.link) : nothing
      }`;
  }

  private renderModes(modes: NonNullable<SheetView['modes']>) {
    const row = (
      m: NonNullable<SheetView['modes']>['brightness'],
      kind: ModeKind,
      gi: string,
      icon: ReturnType<typeof ico>,
    ) =>
      html`<div class="lgr">
        <span class="lgi" style=${styleMap({'--gi': gi})}>${icon}</span
        ><span class="tx"><b>${m.label}</b><small>${m.desc}</small></span
        ><hp-switch
          data-l=${MODE_HOOK[kind]}
          data-id=${m.id}
          .checked=${m.on}
          .disabled=${!m.available}
          .label=${m.label}
          @change=${(e: Event) => this.onSwitch(e, kind)}
        ></hp-switch>
      </div>`;
    return html`<div class="lgrp">
      ${row(modes.brightness, 'brightness', '#D98A1E', ico('lsun', 20))}${row(
        modes.colour,
        'colour',
        '#B8742A',
        ico('palette', 19),
      )}${modes.night ? row(modes.night, 'night', '#C2412A', ico('moon', 19)) : nothing}
    </div>`;
  }

  private renderBulbs(bulbs: NonNullable<SheetView['bulbs']>) {
    return html`<div class="lchips" role="group" aria-label=${bulbs.label}>
      <span class="lcl">${bulbs.label}</span>${bulbs.chips.map(
        chip =>
          html`<button
            type="button"
            class="lchip"
            aria-pressed=${chip.on ? 'true' : 'false'}
            data-l="one"
            data-id=${chip.id}
            ?disabled=${!chip.available}
            @click=${() => this.dispatchEvent(new SheetIntentEvent({kind: 'bulb', id: chip.id}))}
          >
            <span class="ck" aria-hidden="true">${ico('check', 14)}</span>${chip.label}
          </button>`,
      )}
    </div>`;
  }

  private renderLink(link: SheetView['link']) {
    return html`<div class="lgrp">
      <button
        type="button"
        class="lgr lnav"
        data-l="pick"
        data-a=${ifDefined(this.view?.key)}
        ?disabled=${!link.enabled}
        @click=${this.onPick}
      >
        <span class="lgi" style=${styleMap({'--gi': '#5B7FB8'})}>${ico('link', 19)}</span
        ><span class="tx"><b>${link.label}</b><small>${link.desc}</small></span
        ><span class="lval">${link.value}</span>${ico('chev', 18)}
      </button>
    </div>`;
  }

  private readonly onPower = (): void => {
    if (this.view) this.dispatchEvent(new AreaToggleEvent(this.view.key));
  };

  // the switch says the state it asks for; the pane turns the pair the other way from what it reads, as the legacy panel did
  private onSwitch(e: Event, kind: ModeKind): void {
    e.stopPropagation();
    this.dispatchEvent(new SheetIntentEvent({kind}));
  }

  private readonly onPick = (): void => {
    this.picking = true;
  };

  // Back: the room's body again (a pick leaves the list up, its check mark moved, as the legacy sheet did), and focus on the "Linked with" row, without the ring a key press would show
  private readonly onBack = (): void => {
    this.picking = false;
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>('.lnav')?.focus({preventScroll: true, focusVisible: false}),
    );
  };

  // a tap on the scrim, not on the panel
  private readonly onBackdrop = (e: Event): void => {
    if (e.target === e.currentTarget) this.dismiss();
  };

  private readonly dismiss = (): void => {
    this.dispatchEvent(new SheetDismissEvent(ROOM_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-light-sheet': LightSheet;
  }
  interface HTMLElementEventMap {
    'sheet-intent': SheetIntentEvent;
  }
}

if (!customElements.get('hp-light-sheet')) customElements.define('hp-light-sheet', LightSheet);
