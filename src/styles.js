// The panel's stylesheet: each file as text (Vite's ?raw), joined in this order and injected by the class.
// motion.css comes last because it overrides the others.
import base from './css/base.css?raw';
import extra from './css/extra.css?raw';
import tabs from './css/tabs.css?raw';
import phone from './css/phone.css?raw';
import glass from './css/glass.css?raw';
import lights from './css/lights.css?raw';
import live from './css/live.css?raw';
import motion from './css/motion.css?raw';

export const CSS = [base, extra, tabs, phone, glass, lights, live, motion].join('');
