// The entry Vite bundles into dist/home-panel.js: register the legacy class as the shell's guest, then define the
// custom element Home Assistant mounts as the panel. The guest comes first, so the first <home-panel> already has one.
import {LegacyPanel} from './home-panel.js';
import {CSS} from './styles.js';
import {registerGuest} from './shell/guest.ts';
import {HomePanel} from './shell/home-panel.ts';
// defines <hp-switch> for the controls that move after Media's pane (spec 16); test/e2e/switch.spec.ts mounts it in the harness page
import './ui/switch.ts';

registerGuest(() => new LegacyPanel(), CSS);
if (!customElements.get('home-panel')) customElements.define('home-panel', HomePanel);
