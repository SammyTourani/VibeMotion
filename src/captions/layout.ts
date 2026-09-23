// Caption layout: groups words into pages of at most N lines, breaking on
// sentence ends, on pauses, and when a line is full. Pure, with an injected
// text measurer, so it is unit-testable and shared by preview and export.

export interface CaptionWord {
  id: string;
  text: string;
  /** Output time, seconds. */
  start: number;
  end: number;
  emphasized: boolean;
}

export interface LaidWord {
  /** Index into the input word list. */
  index: number;
  id: string;
  text: string;
  start: number;
  end: number;
  /** Offset from the start of the line, px. */
  x: number;
  width: number;
  emphasized: boolean;
}

export interface LaidLine {
  words: LaidWord[];
  width: number;
}

export interface CaptionPage {
  start: number;
  end: number;
  lines: LaidLine[];
}

export interface PaginateOptions {
  maxWordsPerLine: number;
  maxLines: number;
  /** px */
  maxWidth: number;
  /** A gap longer than this (s) starts a new page. */
  pauseBreak?: number;
  /** How long (s) a page stays up after its last word, at most. */
  linger?: number;
  measure: (text: string) => number;
}

const endsSentence = (t: string) => /[.?!…]["')\]]*$/.test(t);
const endsClause = (t: string) => /[,;:—–]["')\]]*$/.test(t);

export function paginate(words: readonly CaptionWord[], o: PaginateOptions): CaptionPage[] {
  const pauseBreak = o.pauseBreak ?? 0.4;
  const linger = o.linger ?? 0.6;
  const space = o.measure(' ');
  const pages: CaptionPage[] = [];
  let page: CaptionPage | null = null;

  const newLine = (w: LaidWord): LaidLine => ({ words: [{ ...w, x: 0 }], width: w.width });

  for (let i = 0; i < words.length; i++) {
    const src = words[i]!;
    const text = src.text.trim();
    if (!text) continue;
    const width = o.measure(text);
    const laid: LaidWord = {
      index: i,
      id: src.id,
      text,
      start: src.start,
      end: Math.max(src.end, src.start),
      x: 0,
      width,
      emphasized: src.emphasized,
    };
    const prev = page ? lastWord(page) : null;
    let startPage = !page || !prev;
    if (!startPage && prev) {
      if (src.start - prev.end > pauseBreak || endsSentence(prev.text)) startPage = true;
    }
    if (!startPage && page) {
      const line = page.lines[page.lines.length - 1]!;
      const fits = line.words.length < o.maxWordsPerLine && line.width + space + width <= o.maxWidth;
      const clauseBreak = !!prev && endsClause(prev.text) && line.words.length >= 2;
      if (fits && !(clauseBreak && page.lines.length < o.maxLines)) {
        laid.x = line.width + space;
        line.words.push(laid);
        line.width = laid.x + width;
      } else if (page.lines.length < o.maxLines) {
        page.lines.push(newLine(laid));
      } else {
        startPage = true;
      }
    }
    if (startPage) {
      page = { start: laid.start, end: laid.end, lines: [newLine(laid)] };
      pages.push(page);
    }
  }

  // Timing: a page shows from its first word until the next page starts,
  // but never lingers more than `linger` after its last word.
  for (let p = 0; p < pages.length; p++) {
    const pg = pages[p]!;
    const last = lastWord(pg)!;
    const next = pages[p + 1];
    const hold = last.end + linger;
    pg.end = next ? Math.min(next.start, Math.max(hold, last.end)) : hold;
    if (next && next.start - last.end < 0.25) pg.end = next.start;
  }
  return pages;
}

function lastWord(p: CaptionPage): LaidWord | null {
  const line = p.lines[p.lines.length - 1];
  return line ? line.words[line.words.length - 1] ?? null : null;
}

export function pageWords(p: CaptionPage): LaidWord[] {
  return p.lines.flatMap((l) => l.words);
}

/** The page on screen at output time t, or null. */
export function pageAt(pages: readonly CaptionPage[], t: number): CaptionPage | null {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pages[mid]!;
    if (t < p.start) hi = mid - 1;
    else if (t >= p.end) lo = mid + 1;
    else return p;
  }
  return null;
}

/**
 * Index (within the page, in reading order) of the word being spoken at t.
 * Between words the last spoken word stays active. -1 before the first.
 */
export function activeIndex(page: CaptionPage, t: number): number {
  const ws = pageWords(page);
  let idx = -1;
  for (let i = 0; i < ws.length; i++) {
    if (ws[i]!.start <= t) idx = i;
    else break;
  }
  return idx;
}
