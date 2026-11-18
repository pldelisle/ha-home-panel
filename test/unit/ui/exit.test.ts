// Exit at the controller seam (ADR 0005; no Lit element is mounted in Node): what <hp-dialog> and <hp-sheet> hand it is `done`, their event and their close.
// Under Liquid Glass `done` runs synchronously, as it always did; under Material it runs once, after the leave animations have finished, and a second ask while leaving does nothing.
import {describe, expect, test, vi} from 'vitest';
import {Exit} from '../../../src/ui/controllers/exit.ts';
import {cssMs} from '../../../src/ui/controllers/swipe-to-close.ts';

/** An element whose animations finish when the test says so. */
function setup(animated: boolean) {
  let finish!: () => void;
  const finished = new Promise<void>(resolve => (finish = resolve));
  const target = {getAnimations: vi.fn(() => [{finished}])};
  const marks: boolean[] = [];
  const exit = new Exit({animated: () => animated, target: () => target, mark: on => marks.push(on)});
  return {exit, target, marks, finish};
}

describe('Exit', () => {
  test('Liquid Glass: done runs synchronously, and nothing is marked or waited for', () => {
    const {exit, target, marks} = setup(false);
    const done = vi.fn();
    void exit.run(done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(marks).toEqual([]);
    expect(target.getAnimations).not.toHaveBeenCalled();
    expect(exit.leaving).toBe(false);
  });

  test('Material: marked leaving at once, done only after the animations finish, then unmarked', async () => {
    const {exit, target, marks, finish} = setup(true);
    const done = vi.fn();
    const ran = exit.run(done);
    expect(marks).toEqual([true]);
    expect(exit.leaving).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    finish();
    await ran;
    expect(target.getAnimations).toHaveBeenCalledWith({subtree: true});
    expect(done).toHaveBeenCalledTimes(1);
    expect(marks).toEqual([true, false]);
    expect(exit.leaving).toBe(false);
  });

  test('Material: a second run while leaving is a no-op, and one after it has ended runs', async () => {
    const {exit, finish} = setup(true);
    const first = vi.fn();
    const second = vi.fn();
    const ran = exit.run(first);
    await exit.run(second);
    expect(second).not.toHaveBeenCalled();
    finish();
    await ran;
    expect(first).toHaveBeenCalledTimes(1);
    await exit.run(second);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('Material: an element with nothing animating, or no element, is done as soon as it is drawn', async () => {
    const marks: boolean[] = [];
    const done = vi.fn();
    const drawn = vi.fn(() => Promise.resolve());
    await new Exit({animated: () => true, target: () => null, mark: on => marks.push(on), drawn}).run(done);
    expect(drawn).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(marks).toEqual([true, false]);
  });

  test('Material: an animation that is cancelled does not hold the close', async () => {
    const target = {getAnimations: () => [{finished: Promise.reject(new Error('cancelled'))}]};
    const done = vi.fn();
    await new Exit({animated: () => true, target: () => target, mark: () => {}}).run(done);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('cssMs, the slide the drag waits for', () => {
  test('reads milliseconds and seconds, and falls back for anything else', () => {
    expect(cssMs('347ms', 180)).toBe(347);
    expect(cssMs(' 180ms ', 1)).toBe(180);
    expect(cssMs('0.2s', 1)).toBe(200);
    expect(cssMs('.5s', 1)).toBe(500);
    expect(cssMs('', 180)).toBe(180);
    expect(cssMs('fast', 180)).toBe(180);
    expect(cssMs('12', 180)).toBe(180);
  });
});
