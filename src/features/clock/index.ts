// The clock feature's public face: the idle clock's element and its tick (the idle screen drifts on it), which the shell's idle screen places by importing this module.
// Pattern: a feature's barrel (ADR 0011): the clock is no tab, so it exports no descriptor; the shell composes `<hp-clock>` beside the
// smart stack in `<hp-idle-screen>` (#276).
// Must not: draw, hold state, import another feature or the shell, or read an entity.
export {CLOCK_TICK_MS, HpClock} from './clock.ts';
