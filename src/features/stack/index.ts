// The smart stack's public face: `<hp-smart-stack>`, which the Home pane places in its card and the idle screen beside the clock.
// Pattern: a feature's barrel (ADR 0011): the stack is no tab, so it exports no descriptor; the Home pane (#268) and the shell's
// idle screen (#276) compose it.
// Must not: draw, hold state, import the guest or another feature, or read an entity.
export {SmartStack} from './smart-stack.ts';
