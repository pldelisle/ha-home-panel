// The panel's stylesheet: each file as text, joined in this order and injected by the class. Vite runs an `?inline`
// import through its CSS pipeline (Lightning CSS minify, for the browsers in `build.cssTarget` in vite.config.ts),
// where `?raw` was the file's text as written.
// The files of src/ui/styles/ are the kit's (ADR 0019): its elements adopt the same text, and each sits here at the
// position its first rule held; a rule that followed it in a later legacy file moves up to it, and the computed-style
// comparison checked what that reordered. The tokens and the common rules open the sheet, as the palette and the resets
// did; the segmented control and the range tabs follow base.css (the tabs' rules moved up from base.css, glass.css and motion.css with the Weather history, #159); the sheet's chrome comes after tabs.css and before phone.css, and the header's badge
// and the pane header follow it; the tile, the More list and the settings popup's tiles (from the end of extra.css, with their
// glass rules) come after phone.css and before glass.css, followed by the detail panel's tiles, inner cards and chart legend (their rules
// moved up from base.css, tabs.css, extra.css, motion.css and glass.css with the Weather detail, #158). The state pill follows base.css, where its rule was (#273); the hero follows it, where its rules were (#239), and the pill button after it (#248); the status list's rows and chips (`.att`, `.arow`, `.clear`, #252) come right after base.css, where they began. motion.css comes last because it overrides the others. The progress ring (`.lring`) follows glass.css, after the lights.css that #262 deleted, where live.css held it (#256; #257 deleted live.css).
import tokens from './ui/styles/tokens.css?inline';
import common from './ui/styles/common.css?inline';
import base from './css/base.css?inline';
import pill from './ui/styles/pill.css?inline';
import list from './ui/styles/list.css?inline';
import button from './ui/styles/button.css?inline';
import hero from './ui/styles/hero.css?inline';
import seg from './ui/styles/seg.css?inline';
import range from './ui/styles/range.css?inline';
import extra from './css/extra.css?inline';
import tabs from './css/tabs.css?inline';
import sheet from './ui/styles/sheet.css?inline';
import badge from './ui/styles/badge.css?inline';
import paneHeader from './ui/styles/pane-header.css?inline';
import phone from './css/phone.css?inline';
import statTile from './ui/styles/stat-tile.css?inline';
import tiles from './ui/styles/tiles.css?inline';
import inner from './ui/styles/inner.css?inline';
import chart from './ui/styles/chart.css?inline';
import more from './ui/styles/more.css?inline';
import settings from './ui/styles/settings.css?inline';
import glass from './css/glass.css?inline';
import ring from './ui/styles/ring.css?inline';
import motion from './css/motion.css?inline';
import keyframes from './ui/styles/motion.css?inline';

export const CSS = [
  tokens,
  common,
  base,
  pill,
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
