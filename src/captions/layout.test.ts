import { describe, expect, it } from 'vitest';
import { activeIndex, pageAt, pageWords, paginate, type CaptionWord } from './layout';

// 10 px per character, so widths are easy to reason about
const measure = (t: string) => t.length * 10;

function words(spec: string, gap = 0.1, dur = 0.3): CaptionWord[] {
  let t = 0;
  return spec.split(' ').map((text, i) => {
    const w = { id: `w${i}`, text, start: t, end: t + dur, emphasized: false };
    t += dur + gap;
    return w;
  });
}

const texts = (p: ReturnType<typeof paginate>[number]) => p.lines.map((l) => l.words.map((w) => w.text).join(' '));

describe('paginate', () => {
  it('fills lines up to the word limit, then pages', () => {
    const pages = paginate(words('one two three four five six seven'), { maxWordsPerLine: 3, maxLines: 2, maxWidth: 1000, measure });
    expect(pages.map(texts)).toEqual([['one two three', 'four five six'], ['seven']]);
  });

  it('breaks lines on width', () => {
    const pages = paginate(words('aaaa bbbb cccc'), { maxWordsPerLine: 9, maxLines: 2, maxWidth: 95, measure });
    expect(pages.map(texts)).toEqual([['aaaa bbbb', 'cccc']]);
  });

  it('starts a new page after a sentence ends', () => {
    const pages = paginate(words('Hello there. General Kenobi'), { maxWordsPerLine: 5, maxLines: 2, maxWidth: 1000, measure });
    expect(pages.map(texts)).toEqual([['Hello there.'], ['General Kenobi']]);
  });

  it('starts a new page after a pause', () => {
    const ws = words('before the pause after');
    ws[3]!.start += 1;
    ws[3]!.end += 1;
    const pages = paginate(ws, { maxWordsPerLine: 5, maxLines: 2, maxWidth: 1000, measure });
    expect(pages.map(texts)).toEqual([['before the pause'], ['after']]);
  });

  it('prefers a line break after a comma', () => {
    const pages = paginate(words('first of all, we ship'), { maxWordsPerLine: 6, maxLines: 2, maxWidth: 1000, measure });
    expect(pages.map(texts)).toEqual([['first of all,', 'we ship']]);
  });

  it('positions words along the line', () => {
    const [page] = paginate(words('ab cd'), { maxWordsPerLine: 5, maxLines: 1, maxWidth: 1000, measure });
    const [a, b] = pageWords(page!);
    expect(a!.x).toBe(0);
    expect(b!.x).toBe(30); // "ab" (20) + space (10)
    expect(page!.lines[0]!.width).toBe(50);
  });

  it('holds a page until the next one, but not forever', () => {
    const ws = words('one. two.', 0.1, 0.3);
    const pages = paginate(ws, { maxWordsPerLine: 5, maxLines: 1, maxWidth: 1000, measure, linger: 0.6 });
    expect(pages[0]!.end).toBeCloseTo(pages[1]!.start);
    const far = words('one. two.', 3, 0.3);
    const p2 = paginate(far, { maxWordsPerLine: 5, maxLines: 1, maxWidth: 1000, measure, linger: 0.6 });
    expect(p2[0]!.end).toBeCloseTo(0.9);
  });
});

describe('active word', () => {
  it('finds the page and word being spoken', () => {
    const pages = paginate(words('one two three four'), { maxWordsPerLine: 2, maxLines: 1, maxWidth: 1000, measure });
    expect(pageAt(pages, -1)).toBeNull();
    const p = pageAt(pages, 0.45)!;
    expect(texts(p)).toEqual(['one two']);
    expect(activeIndex(p, 0.45)).toBe(1);
    // between words, the last spoken word stays active
    expect(activeIndex(p, 0.35)).toBe(0);
  });
});
