// SRT, WebVTT and plain-text transcripts, all in output time (after cuts),
// so they line up with the exported MP4.

import { paginate, type CaptionWord } from '../captions/layout';

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/**
 * Subtitle cues following broadcast conventions: at most 2 lines of 42
 * characters, broken at sentence ends and pauses.
 */
export function buildCues(words: readonly CaptionWord[], maxChars = 42, maxLines = 2): Cue[] {
  const pages = paginate(words, {
    maxWordsPerLine: 64,
    maxLines,
    maxWidth: maxChars,
    measure: (t) => t.length,
    pauseBreak: 0.8,
    linger: 0.8,
  });
  return pages.map((p) => ({
    start: p.start,
    end: Math.max(p.end, p.start + 0.3),
    text: p.lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n'),
  }));
}

export function formatTimestamp(t: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(h)}:${p2(m)}:${p2(s)}${sep}${String(r).padStart(3, '0')}`;
}

export function toSrt(cues: readonly Cue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${formatTimestamp(c.start, ',')} --> ${formatTimestamp(c.end, ',')}\n${c.text}`)
      .join('\n\n') + '\n'
  );
}

export function toVtt(cues: readonly Cue[]): string {
  const body = cues
    .map((c) => `${formatTimestamp(c.start, '.')} --> ${formatTimestamp(c.end, '.')}\n${c.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/** Plain transcript: sentences grouped into paragraphs at long pauses. */
export function toTxt(words: readonly CaptionWord[], paragraphGap = 1.2): string {
  const paras: string[][] = [[]];
  let prevEnd = -Infinity;
  let prevText = '';
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    const sentenceDone = /[.?!…]["')\]]*$/.test(prevText);
    if (paras[paras.length - 1]!.length > 0 && sentenceDone && w.start - prevEnd > paragraphGap) paras.push([]);
    paras[paras.length - 1]!.push(text);
    prevEnd = w.end;
    prevText = text;
  }
  return paras.map((p) => p.join(' ')).filter(Boolean).join('\n\n') + '\n';
}

