// The live feature's elements for the shell's header: importing this module defines <hp-peak-chip>, <hp-live-pill> and <hp-status-popup>; `STATUS_SHEET` names the popup.
// Pattern: plug-in (Fowler, PoEAA, Plugin) without a descriptor: the header is the shell's frame, not a pane, so the shell places the elements itself.
// Must not: draw or hold state, or import the guest or another feature.
import './peak-chip.ts'; // defines <hp-peak-chip>
import './live-pill.ts'; // defines <hp-live-pill>
import './status-popup.ts'; // defines <hp-status-popup>

export {LiveActivitiesEvent} from './live-pill.ts';
export {STATUS_SHEET} from './sheets.ts';
