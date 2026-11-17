// The smart stack's public face: what the Home pane and the idle screen import to show the stack (#266, spec 26).
// Pattern: a feature's barrel (ADR 0011): the stack is no tab, so it exports no descriptor; the shell composes `<hp-smart-stack>` on
// the Home pane and beside the idle clock (#266), and until then nothing imports this folder but its tests.
// Must not: draw, hold state, import the guest or another feature, or read an entity.
export {stackCards, type StackCard} from './cards.ts';
export {stackIds} from './ids.ts';
export {readStack} from './inputs.ts';
export {StackHistory} from './loader.ts';
export {stackModel} from './model.ts';
