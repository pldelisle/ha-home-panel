// The frame's stylesheet: the legacy panel's sheet that outlived it (the rail, the panes, the overlays, the glass, the motion, and the
// rules the Home pane and the header read in this root's light DOM, ADR 0032, ADR 0033), with the kit's files at the place each held.
// Pattern: one text the shell adopts as a constructed sheet (Lit docs, Styles); Vite runs each `?inline` file through Lightning CSS. The order is
// the cascade: motion.css comes last because it overrides the others (the reasons for each place are in git history, src/styles.js).
// Must not: hold a rule an element's own sheet holds (ADR 0019), or be adopted by anything but <home-panel>.
import tokens from '../ui/styles/tokens.css?inline';
import common from '../ui/styles/common.css?inline';
import base from './frame/base.css?inline';
import pill from '../ui/styles/pill.css?inline';
import status from '../ui/styles/status.css?inline';
import list from '../ui/styles/list.css?inline';
import button from '../ui/styles/button.css?inline';
import hero from '../ui/styles/hero.css?inline';
import seg from '../ui/styles/seg.css?inline';
import range from '../ui/styles/range.css?inline';
import extra from './frame/extra.css?inline';
import tabs from './frame/tabs.css?inline';
import sheet from '../ui/styles/sheet.css?inline';
import badge from '../ui/styles/badge.css?inline';
import paneHeader from '../ui/styles/pane-header.css?inline';
import phone from './frame/phone.css?inline';
import statTile from '../ui/styles/stat-tile.css?inline';
import tiles from '../ui/styles/tiles.css?inline';
import inner from '../ui/styles/inner.css?inline';
import chart from '../ui/styles/chart.css?inline';
import more from '../ui/styles/more.css?inline';
import settings from '../ui/styles/settings.css?inline';
import glass from './frame/glass.css?inline';
import ring from '../ui/styles/ring.css?inline';
import motion from './frame/motion.css?inline';
import keyframes from '../ui/styles/motion.css?inline';

export const FRAME_CSS: string = [
  tokens,
  common,
  base,
  pill,
  status,
  list,
  button,
  hero,
  seg,
  range,
  extra,
  tabs,
  sheet,
  badge,
  paneHeader,
  phone,
  statTile,
  tiles,
  inner,
  chart,
  more,
  settings,
  glass,
  ring,
  motion,
  keyframes,
].join('');
