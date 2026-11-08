// The entry Vite bundles into dist/home-panel.js: define the custom element Home Assistant mounts as the panel.
import {HomePanel} from './home-panel.js';

if (!customElements.get('home-panel')) customElements.define('home-panel', HomePanel);
