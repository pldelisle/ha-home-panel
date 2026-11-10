// The kit's stylesheets as what a shadow root adopts: each file of this folder through `forShadow`, as a Lit CSSResult.
// Pattern: adopted stylesheets (Lit docs, Styles): one constructed sheet per file, shared by every instance of an element;
// one source, two views (ADR 0019): src/styles.js concatenates the same files, as written, into the legacy sheet.
// Must not: hold a rule (the files do), adopt the tokens (they reach an element by inheritance from `.app`), or import the shell.
import {unsafeCSS, type CSSResult} from 'lit';
import badgeText from './badge.css?inline';
import chartText from './chart.css?inline';
import commonText from './common.css?inline';
import innerText from './inner.css?inline';
import moreText from './more.css?inline';
import motionText from './motion.css?inline';
import paneHeaderText from './pane-header.css?inline';
import segText from './seg.css?inline';
import settingsText from './settings.css?inline';
import sheetText from './sheet.css?inline';
import statTileText from './stat-tile.css?inline';
import tilesText from './tiles.css?inline';
import {forShadow} from './host.ts';

const adopt = (text: string): CSSResult => unsafeCSS(forShadow(text));

/** `box-sizing`, `[hidden]`, the number face and the tap highlight: what every element needs of the frame's own rules. */
export const common = adopt(commonText);
/** The keyframes the kit's rules name; a shadow root resolves `@keyframes` in its own styles only. */
export const motion = adopt(motionText);
/** A sheet's chrome: the backdrop, the panel, the grabber, the header and its close button. */
export const sheet = adopt(sheetText);
/** The badge in a header's corner: the icon on a tinted square, or on glass. */
export const badge = adopt(badgeText);
/** A pane's header: its row, its heading and its sub-line. */
export const paneHeader = adopt(paneHeaderText);
/** The summary tile. */
export const statTile = adopt(statTileText);
/** The More list's grid. */
export const more = adopt(moreText);
/** The segmented control: a row or a grid of radio buttons, one chosen. */
export const seg = adopt(segText);
/** The settings popup's tiles, its text-size and glass choices and the transparency slider. */
export const settings = adopt(settingsText);
/** The tiles of a detail panel, with the one that opens a history. */
export const tiles = adopt(tilesText);
/** The inner card of a detail panel and the row that sets two of them side by side. */
export const inner = adopt(innerText);
/** A chart's legend and its tooltip's font. */
export const chart = adopt(chartText);
