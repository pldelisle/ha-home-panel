// The panel's stylesheet: each file as text, joined in this order and injected by the class. Vite runs an `?inline`
// import through its CSS pipeline (Lightning CSS minify, for the browsers in `build.cssTarget` in vite.config.ts),
// where `?raw` was the file's text as written.
// The files of src/ui/styles/ are the kit's (ADR 0019): its elements adopt the same text, and each sits here at the
// position its first rule held; a rule that followed it in a later legacy file moves up to it, and the computed-style
// comparison checked what that reordered. The tokens and the common rules open the sheet, as the palette and the resets
// did; the sheet's chrome comes after tabs.css and before phone.css; the tile and the More list come after phone.css and
// before glass.css. motion.css comes last because it overrides the others.
import tokens from './ui/styles/tokens.css?inline';
import common from './ui/styles/common.css?inline';
import base from './css/base.css?inline';
import extra from './css/extra.css?inline';
import tabs from './css/tabs.css?inline';
import sheet from './ui/styles/sheet.css?inline';
import phone from './css/phone.css?inline';
import statTile from './ui/styles/stat-tile.css?inline';
import more from './ui/styles/more.css?inline';
import glass from './css/glass.css?inline';
import lights from './css/lights.css?inline';
import live from './css/live.css?inline';
import motion from './css/motion.css?inline';
import keyframes from './ui/styles/motion.css?inline';

export const CSS = [
  tokens,
  common,
  base,
  extra,
  tabs,
  sheet,
  phone,
  statTile,
  more,
  glass,
  lights,
  live,
  motion,
  keyframes,
].join('');
