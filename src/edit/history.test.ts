import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, createHistory, redo, undo } from './history';

describe('history', () => {
  it('undoes and redoes', () => {
    let h = createHistory({ n: 0 });
    h = commit(h, { n: 1 }, { now: 0 });
    h = commit(h, { n: 2 }, { now: 5000 });
    expect(h.present.n).toBe(2);
    h = undo(h);
    expect(h.present.n).toBe(1);
    h = undo(h);
    expect(h.present.n).toBe(0);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present.n).toBe(1);
    expect(canRedo(h)).toBe(true);
  });

  it('a new edit clears the redo stack', () => {
    let h = createHistory(0);
    h = commit(h, 1, { now: 0 });
    h = undo(h);
    h = commit(h, 2, { now: 5000 });
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual([0]);
  });

  it('coalesces rapid edits with the same key into one step', () => {
    let h = createHistory(0);
    h = commit(h, 1, { coalesce: 'size', now: 1000 });
    h = commit(h, 2, { coalesce: 'size', now: 1200 });
    h = commit(h, 3, { coalesce: 'size', now: 1400 });
    expect(h.past).toEqual([0]);
    h = undo(h);
    expect(h.present).toBe(0);
  });

  it('does not coalesce different keys or slow edits', () => {
    let h = createHistory(0);
    h = commit(h, 1, { coalesce: 'a', now: 0 });
    h = commit(h, 2, { coalesce: 'b', now: 100 });
    h = commit(h, 3, { coalesce: 'b', now: 5000 });
    expect(h.past).toEqual([0, 1, 2]);
  });

  it('ignores no-op commits', () => {
    const h = createHistory(1);
    expect(commit(h, 1)).toBe(h);
  });
});
