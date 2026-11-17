// The smart stack's public face: `<hp-smart-stack>`, which the Home pane places in its card and the shell links so the guest can place it.
// Pattern: a feature's barrel (ADR 0011): the stack is no tab, so it exports no descriptor; the Home pane composes it (#268), and the guest
// places it beside the idle clock through the Home-card bridge (ADR 0031) until the idle screen (spec 26) does.
// Must not: draw, hold state, import the guest or another feature, or read an entity.
export {SmartStack} from './smart-stack.ts';
