import { describe, expect, it } from 'vitest';
import { buildEdl, untranscribedSounds, type EdlInput } from './edl';
import type { Word } from '../project/types';

const W = (id: string, text: string, start: number, end: number): Word => ({ id, text, start, end });

function input(over: Partial<EdlInput> = {}): EdlInput {
  return {
    duration: 10,
    words: [],
    wordEdits: {},
    fillerIds: new Set(),
    silences: [],
    padding: 0.12,
    untranscribed: [],
    rangeOps: [],
    ...over,
  };
}

describe('buildEdl', () => {
  it('keeps everything when nothing is cut', () => {
    const e = buildEdl(input());
    expect(e.kept).toEqual([{ start: 0, end: 10 }]);
    expect(e.outDuration).toBe(10);
    expect(e.srcToOut(3.3)).toBeCloseTo(3.3);
    expect(e.outToSrc(3.3)).toBeCloseTo(3.3);
  });

  it('shortens pauses to the padding on each side', () => {
    const e = buildEdl(input({ silences: [{ start: 2, end: 4 }] }));
    expect(e.cuts[0]!.start).toBeCloseTo(2.12);
    expect(e.cuts[0]!.end).toBeCloseTo(3.88);
    expect(e.outDuration).toBeCloseTo(10 - 1.76);
    // inside the cut maps to where playback resumes
    expect(e.srcToOut(3)).toBeCloseTo(2.12);
    expect(e.outToSrc(2.12)).toBeCloseTo(3.88);
    expect(e.srcToOut(5)).toBeCloseTo(5 - 1.76);
  });

  it('cuts leading and trailing silence right to the edge', () => {
    const e = buildEdl(input({ silences: [{ start: 0, end: 1 }, { start: 9, end: 10 }] }));
    expect(e.kept[0]!.start).toBeCloseTo(0.88);
    expect(e.kept[e.kept.length - 1]!.end).toBeCloseTo(9.12);
  });

  it('removes a deleted word with the pause around it, leaving padding', () => {
    const words = [W('a', 'Hello', 0, 1), W('b', 'um', 1.2, 1.5), W('c', 'world', 2.5, 3)];
    const e = buildEdl(input({ words, wordEdits: { b: 'cut' } }));
    expect(e.cuts[0]!.start).toBeCloseTo(1.12);
    expect(e.cuts[0]!.end).toBeCloseTo(2.38);
    expect(e.wordStatus).toEqual(['kept', 'deleted', 'kept']);
  });

  it('cuts a word right at its edges when the neighbours are close', () => {
    const words = [W('a', 'one', 0, 1), W('b', 'two', 1.05, 1.4), W('c', 'three', 1.45, 2)];
    const e = buildEdl(input({ words, wordEdits: { b: 'cut' } }));
    expect(e.cuts[0]).toEqual({ start: 1.05, end: 1.4 });
  });

  it('never cuts inside a kept word', () => {
    // Whisper says the word runs into what VAD calls silence
    const words = [W('a', 'long', 1, 3)];
    const e = buildEdl(input({ words, silences: [{ start: 2, end: 5 }] }));
    for (const c of e.cuts) expect(c.end <= 1 || c.start >= 3).toBe(true);
    expect(e.cuts[0]!.start).toBeCloseTo(3);
  });

  it('auto-cuts fillers unless the user keeps them', () => {
    const words = [W('a', 'So', 0, 0.4), W('b', 'um,', 0.5, 0.8), W('c', 'yes', 0.9, 1.3)];
    const auto = buildEdl(input({ words, fillerIds: new Set(['b']) }));
    expect(auto.wordStatus[1]).toBe('filler');
    const kept = buildEdl(input({ words, fillerIds: new Set(['b']), wordEdits: { b: 'keep' } }));
    expect(kept.wordStatus[1]).toBe('kept');
    expect(kept.cuts).toEqual([]);
  });

  it('applies timeline cuts and restores in order', () => {
    const e = buildEdl(
      input({
        rangeOps: [
          { kind: 'cut', start: 5, end: 6 },
          { kind: 'restore', start: 5.5, end: 7 },
        ],
      }),
    );
    expect(e.cuts).toEqual([{ start: 5, end: 5.5 }]);
  });

  it('a timeline restore brings back an automatic pause cut', () => {
    const e = buildEdl(input({ silences: [{ start: 2, end: 4 }], rangeOps: [{ kind: 'restore', start: 1, end: 5 }] }));
    expect(e.cuts).toEqual([]);
  });

  it('drops kept slivers that hold no words', () => {
    const e = buildEdl(input({ silences: [{ start: 2, end: 3 }, { start: 3.3, end: 5 }], padding: 0.12 }));
    // kept gap between the two cuts would be 3.42 - 2.88 = 0.54 (kept) -> still there
    expect(e.kept.length).toBe(3);
    const tight = buildEdl(input({ silences: [{ start: 2, end: 3 }, { start: 3.25, end: 5 }], padding: 0.12 }));
    // 3.37 - 2.88 = 0.49: still kept. Now a real sliver:
    expect(tight.kept.length).toBe(3);
    const sliver = buildEdl(input({ rangeOps: [{ kind: 'cut', start: 2, end: 3 }, { kind: 'cut', start: 3.05, end: 4 }] }));
    expect(sliver.cuts).toEqual([{ start: 2, end: 4 }]);
  });

  it('maps source to output and back inside kept segments', () => {
    const e = buildEdl(input({ silences: [{ start: 1, end: 2 }, { start: 4, end: 6 }] }));
    for (const t of [0.5, 2.5, 3.9, 7, 9.9]) {
      expect(e.outToSrc(e.srcToOut(t))).toBeCloseTo(t, 6);
    }
    expect(e.outToSrc(e.outDuration)).toBeCloseTo(10);
  });

  it('knows where playback resumes after a cut', () => {
    const e = buildEdl(input({ silences: [{ start: 2, end: 4 }] }));
    expect(e.resumeAfter(1)).toBe(1);
    expect(e.resumeAfter(3)).toBeCloseTo(3.88);
    const tail = buildEdl(input({ silences: [{ start: 8, end: 10 }] }));
    expect(tail.resumeAfter(9.5)).toBeNull();
  });

  it('indexes segments in output time (for punch-in zooms)', () => {
    const e = buildEdl(input({ silences: [{ start: 2, end: 3 }, { start: 5, end: 6 }] }));
    expect(e.kept.length).toBe(3);
    expect(e.segmentAtOut(0.5)).toBe(0);
    expect(e.segmentAtOut(e.outStarts[1]! + 0.01)).toBe(1);
    expect(e.segmentAtOut(e.outDuration)).toBe(2);
    expect(e.segmentAtSrc(2.5)).toBe(-1);
  });

  it('handles everything being cut', () => {
    const e = buildEdl(input({ rangeOps: [{ kind: 'cut', start: 0, end: 10 }] }));
    expect(e.kept).toEqual([]);
    expect(e.outDuration).toBe(0);
    expect(e.srcToOut(5)).toBe(0);
  });
});

describe('untranscribedSounds', () => {
  it('flags voiced sounds in gaps between words', () => {
    const words = [W('a', 'hi', 0, 1), W('b', 'there', 2, 3)];
    const sounds = untranscribedSounds(words, 5, (s, e) => (s < 1.6 && e > 1.3 ? { start: 1.3, end: 1.6 } : null));
    expect(sounds.length).toBe(1);
    expect(sounds[0]!.start).toBeCloseTo(1.26);
    expect(sounds[0]!.end).toBeCloseTo(1.64);
  });

  it('ignores short gaps and silent gaps', () => {
    const words = [W('a', 'hi', 0, 1), W('b', 'there', 1.1, 2)];
    expect(untranscribedSounds(words, 2, () => ({ start: 1, end: 1.1 }))).toEqual([]);
    expect(untranscribedSounds([W('a', 'x', 0, 1), W('b', 'y', 3, 4)], 4, () => null)).toEqual([]);
  });
});
