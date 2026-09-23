import type { Edl } from '../edit/edl';
import type { Word } from '../project/types';
import type { CaptionWord } from './layout';

/** Kept words in output time, with spelling fixes applied. */
export function captionWords(
  words: readonly Word[],
  edl: Edl,
  textFixes: Readonly<Record<string, string>>,
  emphasized: readonly string[],
): CaptionWord[] {
  const emph = new Set(emphasized);
  const out: CaptionWord[] = [];
  words.forEach((w, i) => {
    if (edl.wordStatus[i] !== 'kept') return;
    const start = edl.srcToOut(w.start);
    const end = Math.max(start, edl.srcToOut(w.end));
    out.push({ id: w.id, text: textFixes[w.id] ?? w.text, start, end, emphasized: emph.has(w.id) });
  });
  return out;
}
