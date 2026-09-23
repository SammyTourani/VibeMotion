import { describe, expect, it } from 'vitest';
import { complement, indexAt, normalize, subtract, totalLength, union } from './intervals';

const iv = (start: number, end: number) => ({ start, end });

describe('intervals', () => {
  it('normalizes: sorts, merges overlaps and touching ranges, drops empties', () => {
    expect(normalize([iv(5, 6), iv(1, 2), iv(1.5, 3), iv(3, 4), iv(7, 7)])).toEqual([iv(1, 4), iv(5, 6)]);
  });

  it('unions', () => {
    expect(union([iv(0, 1)], [iv(0.5, 2), iv(3, 4)])).toEqual([iv(0, 2), iv(3, 4)]);
  });

  it('subtracts, splitting where needed', () => {
    expect(subtract([iv(0, 10)], [iv(2, 3), iv(5, 6)])).toEqual([iv(0, 2), iv(3, 5), iv(6, 10)]);
    expect(subtract([iv(0, 1), iv(2, 3)], [iv(0.5, 2.5)])).toEqual([iv(0, 0.5), iv(2.5, 3)]);
    expect(subtract([iv(1, 2)], [iv(0, 5)])).toEqual([]);
  });

  it('complements within bounds', () => {
    expect(complement([iv(1, 2), iv(3, 4)], 0, 5)).toEqual([iv(0, 1), iv(2, 3), iv(4, 5)]);
    expect(totalLength(complement([], 0, 5))).toBe(5);
  });

  it('finds the interval containing t', () => {
    const list = [iv(0, 1), iv(2, 3), iv(4, 5)];
    expect(indexAt(list, 2.5)).toBe(1);
    expect(indexAt(list, 1.5)).toBe(-1);
    expect(indexAt(list, 5)).toBe(-1);
  });
});
