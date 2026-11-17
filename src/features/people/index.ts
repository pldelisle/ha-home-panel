// The people feature's public face: Who's home's two elements, which the shell links by importing this module so the guest can place them.
// Pattern: a feature's barrel (ADR 0011): Who's home is no tab, so it exports no descriptor; the guest places `<hp-who-chips>` in the
// header and `<hp-who-card>` in the Home card through the Home-card bridge (ADR 0031) until the shell composes them (#268, #269).
// Must not: draw, hold state, import the guest or another feature, or read an entity.
export {peopleIds} from './ids.ts';
export {peopleModel, type PeopleViewModel} from './model.ts';
export {WhoCard} from './who-card.ts';
export {WhoChips} from './who-chips.ts';
