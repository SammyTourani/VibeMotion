import { describe, expect, it } from 'vitest';
import { DEFAULT_FILLERS, findFillers, normalizeToken } from './fillers';
import type { Word } from '../project/types';

const words = (text: string): Word[] =>
  text.split(' ').map((t, i) => ({ id: `w${i}`, text: t, start: i, end: i + 0.5 }));
const ids = (ws: Word[], set: Set<string>) => ws.filter((w) => set.has(w.id)).map((w) => w.text);

describe('fillers', () => {
  it('normalizes tokens and folds variants', () => {
    expect(normalizeToken('Um,')).toBe('um');
    expect(normalizeToken('Ummm...')).toBe('um');
    expect(normalizeToken('Uhh')).toBe('uh');
    expect(normalizeToken('Hmmm?')).toBe('hmm');
    expect(normalizeToken("don't")).toBe("don't");
  });

  it('finds default fillers', () => {
    const ws = words('Um, so I think, uh, we should, er, go. Hmm.');
    expect(ids(ws, findFillers(ws, [...DEFAULT_FILLERS]))).toEqual(['Um,', 'uh,', 'er,', 'Hmm.']);
  });

  it('respects the enabled list', () => {
    const ws = words('Um, uh, okay.');
    expect(ids(ws, findFillers(ws, ['uh']))).toEqual(['uh,']);
  });

  it('only cuts "like" where it is a filler', () => {
    const ws = words('I like pizza. It was, like, huge and like, wow.');
    expect(ids(ws, findFillers(ws, ['like']))).toEqual(['like,', 'like,']);
  });

  it('cuts "you know" set off by commas but keeps "do you know"', () => {
    const ws = words('It works, you know, pretty well. Do you know why?');
    expect(ids(ws, findFillers(ws, ['you know']))).toEqual(['you', 'know,']);
  });

  it('cuts sentence-initial "so" and "basically" when opted in', () => {
    const ws = words('So, we shipped it. It was basically, done. Not so bad.');
    expect(ids(ws, findFillers(ws, ['so', 'basically']))).toEqual(['So,', 'basically,']);
  });
});
