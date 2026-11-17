// The smart stack's public face: `<hp-smart-stack>`, which the shell links by importing this module so the guest can place it.
// Pattern: a feature's barrel (ADR 0011): the stack is no tab, so it exports no descriptor; the guest places the element in the Home
// card and beside the idle clock through the Home-card bridge (ADR 0031) until the Home pane (#268) and the idle screen (spec 26) do.
// Must not: draw, hold state, import the guest or another feature, or read an entity.
export {SmartStack} from './smart-stack.ts';
