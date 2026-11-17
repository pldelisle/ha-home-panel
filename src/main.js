// The entry Vite bundles into dist/home-panel.js: define the custom element Home Assistant mounts as the panel.
import {HomePanel} from './shell/home-panel.ts';
// defines <hp-switch> for the controls; test/e2e/command-layer.spec.ts mounts it in the harness page
import './ui/switch.ts';

if (!customElements.get('home-panel')) customElements.define('home-panel', HomePanel);
