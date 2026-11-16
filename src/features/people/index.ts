// The people feature's public face: what the header, the Home pane and the smart stack import to say who is home.
// Pattern: a feature's barrel (ADR 0011): Who's home is no tab, so it exports no descriptor; the shell composes its elements on the
// Home pane and in the header (#266, #268, #269), and the reading itself is the provider's (`src/providers/people.ts`).
// Must not: draw, hold state, import the guest or another feature, or read an entity.
export {peopleIds} from './ids.ts';
export {peopleModel, type PeopleViewModel, type PersonChip} from './model.ts';
