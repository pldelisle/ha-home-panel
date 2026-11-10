// The panel's stylesheet: each file as text, joined in this order and injected by the class. Vite runs an `?inline`
// import through its CSS pipeline (Lightning CSS minify, for the browsers in `build.cssTarget` in vite.config.ts),
// where `?raw` was the file's text as written.
// motion.css comes last because it overrides the others.
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
