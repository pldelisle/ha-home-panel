// The Ask feature's elements: importing this module defines <hp-ask-sheet> and <hp-ask-answer>; `ASK_SHEET` names the sheet.
// Pattern: plug-in (Fowler, PoEAA, Plugin) without a descriptor, loaded lazily: the header is the shell's frame, not a pane, so the shell places the sheet itself and imports this module
// dynamically on the first tap of the Ask button, which makes the folder a chunk of its own (spec 29, "Performance, by construction"). The rest of the folder is its pure half and its loader.
// Must not: draw or hold state, import another feature or the shell, or be imported statically by anything: a static import would put the feature in the entry.
import './ask-answer.ts'; // defines <hp-ask-answer>
import './ask-sheet.ts'; // defines <hp-ask-sheet>

export {ASK_SHEET} from './sheets.ts';
