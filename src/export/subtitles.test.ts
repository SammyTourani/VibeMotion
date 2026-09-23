import { describe, expect, it } from 'vitest';
import { buildCues, formatTimestamp, toSrt, toTxt, toVtt } from './subtitles';
import { buildEdl } from '../edit/edl';
import { captionWords } from '../captions/words';
import type { Word } from '../project/types';

describe('subtitle formats', () => {
  it('formats timestamps', () => {
    expect(formatTimestamp(0, ',')).toBe('00:00:00,000');
    expect(formatTimestamp(3723.4567, ',')).toBe('01:02:03,457');
    expect(formatTimestamp(61.5, '.')).toBe('00:01:01.500');
  });

  it('writes SRT and VTT', () => {
    const cues = [
      { start: 0, end: 1.5, text: 'Hello there.' },
      { start: 1.5, end: 3, text: 'Second line\nwraps.' },
    ];
    expect(toSrt(cues)).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nHello there.\n\n2\n00:00:01,500 --> 00:00:03,000\nSecond line\nwraps.\n',
    );
    expect(toVtt(cues).startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nHello there.')).toBe(true);
  });

  it('keeps cue lines within 42 characters and two lines', () => {
    const text = 'This is a fairly long sentence that should wrap across more than one subtitle line for sure';
    let t = 0;
    const words = text.split(' ').map((w, i) => {
      const cw = { id: `w${i}`, text: w, start: t, end: t + 0.2, emphasized: false };
      t += 0.25;
      return cw;
    });
    for (const c of buildCues(words)) {
      const lines = c.text.split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(42);
    }
  });

  it('times cues in output time, after cuts', () => {
    const words: Word[] = [
      { id: 'a', text: 'Hello.', start: 1, end: 1.5 },
      { id: 'b', text: 'um', start: 2, end: 2.3 },
      { id: 'c', text: 'World.', start: 5, end: 5.6 },
    ];
    const edl = buildEdl({
      duration: 7,
      words,
      wordEdits: { b: 'cut' },
      fillerIds: new Set(),
      silences: [{ start: 0, end: 1 }, { start: 2.5, end: 5 }],
      padding: 0.12,
      untranscribed: [],
      rangeOps: [],
    });
    const cw = captionWords(words, edl, {}, []);
    expect(cw.map((w) => w.text)).toEqual(['Hello.', 'World.']);
    const cues = buildCues(cw);
    expect(cues[0]!.start).toBeCloseTo(0.12, 2);
    expect(cues[1]!.start).toBeCloseTo(edl.srcToOut(5), 5);
    expect(cues[1]!.start).toBeLessThan(1.0);
  });

  it('writes a plain transcript with paragraphs at long pauses', () => {
    const w = (id: string, text: string, start: number) => ({ id, text, start, end: start + 0.3, emphasized: false });
    const txt = toTxt([w('a', 'One.', 0), w('b', 'Two.', 0.5), w('c', 'Three.', 3)]);
    expect(txt).toBe('One. Two.\n\nThree.\n');
  });
});
