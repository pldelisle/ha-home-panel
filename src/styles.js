// The panel's stylesheet: each file as text, joined in this order and injected by the class. Vite runs an `?inline`
// import through its CSS pipeline (Lightning CSS minify, for the browsers in `build.cssTarget` in vite.config.ts),
// where `?raw` was the file's text as written.
// motion.css comes last because it overrides the others.
import base from './css/base.css?inline';
import extra from './css/extra.css?inline';
import tabs from './css/tabs.css?inline';
import phone from './css/phone.css?inline';
import glass from './css/glass.css?inline';
import lights from './css/lights.css?inline';
import live from './css/live.css?inline';
import motion from './css/motion.css?inline';

export const CSS = [base, extra, tabs, phone, glass, lights, live, motion].join('');
