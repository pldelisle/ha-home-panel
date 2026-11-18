// The people feature's public face: Who's home's two elements, which the shell links by importing this module.
// Pattern: a feature's barrel (ADR 0011): Who's home is no tab, so it exports no descriptor; the Home pane composes `<hp-who-card>` (#268),
// which places `<hp-who-chips>`.
// Must not: draw, hold state, import another feature, or read an entity.
export {peopleIds} from './ids.ts';
export {peopleModel, type PeopleViewModel} from './model.ts';
export {WhoCard} from './who-card.ts';
export {WhoChips} from './who-chips.ts';
