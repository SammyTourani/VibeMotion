// Filler word detection on Whisper's word list.
//
// "um", "uh", "er", "ah", "hmm", "mm" are removed by default. "like",
// "you know", "so" and "basically" are opt-in, and only match where they act
// as fillers (set off by commas, or at the start of a sentence), so "I like
// it" and "do you know" survive.

import type { Word } from '../project/types';

export const DEFAULT_FILLERS = ['um', 'uh', 'er', 'ah', 'hmm', 'mm'] as const;
export const OPTIONAL_FILLERS = ['like', 'you know', 'so', 'basically'] as const;

const VARIANTS: Record<string, string> = {
  umm: 'um',
  ummm: 'um',
  uhm: 'um',
  erm: 'um',
  uhh: 'uh',
  uhhh: 'uh',
  err: 'er',
  ahh: 'ah',
  ahhh: 'ah',
  hm: 'hmm',
  hmmm: 'hmm',
  hmmmm: 'hmm',
  mmm: 'mm',
  mhm: 'mm',
};

/** Lowercase, punctuation stripped, common spelling variants folded. */
export function normalizeToken(text: string): string {
  const t = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, '')
    .replace(/^'+|'+$/g, '');
  return VARIANTS[t] ?? t;
}

const endsClause = (text: string) => /[,;:]\s*$/.test(text);
const endsSentence = (text: string) => /[.?!…]\s*$/.test(text);

/** Ids of words that are fillers, given the enabled filler list. */
export function findFillers(words: readonly Word[], enabled: readonly string[]): Set<string> {
  const on = new Set(enabled.map((e) => e.toLowerCase()));
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const tok = normalizeToken(w.text);
    if (!tok) continue;
    const prev = words[i - 1];
    const next = words[i + 1];
    const sentenceStart = !prev || endsSentence(prev.text);
    const setOff = (prev ? endsClause(prev.text) : true) || endsClause(w.text);

    if ((DEFAULT_FILLERS as readonly string[]).includes(tok)) {
      if (on.has(tok)) out.add(w.id);
      continue;
    }
    if (tok === 'like' && on.has('like')) {
      // "like," or ", like" — not "I like it".
      if (endsClause(w.text) || (prev && endsClause(prev.text))) out.add(w.id);
      continue;
    }
    if (tok === 'basically' && on.has('basically')) {
      if (setOff || sentenceStart) out.add(w.id);
      continue;
    }
    if (tok === 'so' && on.has('so')) {
      // Sentence-initial "So," / "So we..." as a discourse marker.
      if (sentenceStart && next) out.add(w.id);
      continue;
    }
    if (tok === 'you' && on.has('you know') && next && normalizeToken(next.text) === 'know') {
      const before = !prev || endsClause(prev.text) || endsSentence(prev.text);
      const after = endsClause(next.text) || endsSentence(next.text);
      if (before || after) {
        out.add(w.id);
        out.add(next.id);
        i++;
      }
    }
  }
  return out;
}
