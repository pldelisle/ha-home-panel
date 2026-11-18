// LightsCommands: what the Lights elements share to switch lights: the optimistic values, the command runner and the tile's bulb.
// Pattern: a Lit reactive controller composing the kit's `OptimisticController` and `CommandRunner` (ADR 0023), lifted out of <hp-lights-pane>
// so <hp-lights-room> (ADR 0039) sends the same commands through the same runner instead of a copy; the commands themselves are
// `commands.ts`'s pure tables.
// Must not: read an entity or the store, draw, or decide a command: the tables do, and the element hands in the tiles it read.
import type {ReactiveControllerHost} from 'lit';
import type {Command} from '../../core/commands.ts';
import type {Messages} from '../../core/i18n/messages.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {pairOf, toggleArea, type CommandTile} from './commands.ts';

export class LightsCommands {
  private readonly optimistic: OptimisticController;
  private readonly runner: CommandRunner;

  /** `t` is the catalog's, asked at each run: the store arrives when the host connects, which is after the host is made. */
  constructor(host: ReactiveControllerHost & HTMLElement, t: () => Messages['t']) {
    this.optimistic = new OptimisticController(host);
    this.runner = new CommandRunner(host, {overlay: this.optimistic, t});
  }

  /** Runs the commands in order; false after the first failure (the runner has told the person why). */
  runAll(commands: Command[]): Promise<boolean> {
    return this.runner.runAll(commands);
  }

  /** The tile's bulb: its room (and its partner, which acts as one room) goes off if any is on, else on. Nothing when the tile is gone. */
  toggleArea<T extends CommandTile>(tiles: T[], key: string): Promise<boolean> {
    const tile = tiles.find(t => t.key === key);
    return tile ? this.runner.runAll(toggleArea(pairOf(tile, tiles))) : Promise.resolve(true);
  }
}
