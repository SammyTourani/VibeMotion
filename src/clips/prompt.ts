// "Find the best clips": the prompts and the parsers, kept pure so they can be
// tested. The model never produces a timestamp. The code splits the
// transcript into 20-60 s passages at sentence boundaries, and the model
// only chooses passage numbers, which the JSON schema restricts to real ones.
// Small models do much better at choosing from a list than at drawing ranges.

import type { Word } from '../project/types';
import { timecode } from '../lib/format';

export interface Sentence {
  i: number;
  start: number;
  end: number;
  text: string;
}

export interface Passage {
  /** 1-based, as the model sees it. */
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface ClipSuggestion {
  start: number;
  end: number;
  hook: string;
  reason: string;
  score: number;
  /** The first words of the clip, for display. */
  opening: string;
}

export interface ClipResult {
  clips: ClipSuggestion[];
  title: string;
  hashtags: string[];
}

export const MIN_CLIP = 20;
export const MAX_CLIP = 60;

/** Words -> sentences, splitting run-ons so no line gets too long. */
export function sentencesOf(words: readonly Word[], fixes: Readonly<Record<string, string>> = {}, maxWords = 28): Sentence[] {
  const out: Sentence[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({
      i: out.length,
      start: cur[0]!.start,
      end: cur[cur.length - 1]!.end,
      text: cur.map((w) => fixes[w.id] ?? w.text).join(' '),
    });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (/[.?!…]["')\]]*$/.test(w.text) || cur.length >= maxWords) flush();
  }
  flush();
  return out;
}

/**
 * Splits sentences into passages of 20-60 s. Each break goes where the pause
 * between sentences is longest (topics tend to change on a breath), nudged
 * toward `target` seconds, and never leaves a remainder too short to use.
 */
export function passagesOf(sentences: readonly Sentence[], target = 35): Passage[] {
  const out: Passage[] = [];
  const n = sentences.length;
  if (!n) return out;
  const endAll = sentences[n - 1]!.end;
  // What's left becomes one passage when it's about one passage long; a
  // longer tail is split, so a 90 s talk gives three candidates, not two.
  const tail = Math.min(MAX_CLIP, Math.max(2 * MIN_CLIP, target * 1.3));
  let i = 0;
  while (i < n) {
    const t0 = sentences[i]!.start;
    let pick = -1;
    if (endAll - t0 <= tail) pick = n - 1;
    else {
      let best = -Infinity;
      // First try to leave at least MIN_CLIP for the rest; relax if impossible.
      for (const strict of [true, false]) {
        for (let j = i; j < n - 1; j++) {
          const dur = sentences[j]!.end - t0;
          if (dur > MAX_CLIP) break;
          if (dur < MIN_CLIP) continue;
          if (strict && endAll - sentences[j + 1]!.start < MIN_CLIP) continue;
          const gap = Math.min(2, Math.max(0, sentences[j + 1]!.start - sentences[j]!.end));
          const score = 2 * gap - Math.abs(dur - target) / 10;
          if (score > best) {
            best = score;
            pick = j;
          }
        }
        if (pick >= 0) break;
      }
      // Nothing lands in 20-60 s (a very long pause or sentence): take what fits.
      if (pick < 0) {
        pick = i;
        while (pick + 1 < n && sentences[pick + 1]!.end - t0 <= MAX_CLIP) pick++;
      }
    }
    out.push({
      id: out.length + 1,
      start: t0,
      end: sentences[pick]!.end,
      text: sentences
        .slice(i, pick + 1)
        .map((s) => s.text)
        .join(' '),
    });
    i = pick + 1;
  }
  return out;
}

/**
 * Splits passages into groups that fit the model's 4K-token context with
 * room for the answer (about 3.6 characters per token, conservatively).
 */
export function chunkPassages(passages: readonly Passage[], maxChars = 8000): Passage[][] {
  const chunks: Passage[][] = [];
  let cur: Passage[] = [];
  let size = 0;
  for (const p of passages) {
    const len = p.text.length + 24;
    if (cur.length && size + len > maxChars) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export const CLIP_SYSTEM =
  'You pick the parts of a video to post as short videos on TikTok, Instagram Reels and YouTube Shorts. Answer with JSON only.';

export function clipPrompt(passages: readonly Passage[], count: number): string {
  const n = Math.min(count, passages.length);
  const lines = passages.map((p) => `[${p.id}] (${timecode(p.start, false)}-${timecode(p.end, false)}) ${p.text}`).join('\n\n');
  return (
    `Passages from a video, as [number] (start-end) text:\n\n${lines}\n\n` +
    `Choose the ${n} passage${n === 1 ? '' : 's'} that would work best as a short video on its own: ` +
    'it makes sense without the rest of the video and grabs attention in its first sentence. ' +
    'For each give "passage": its number; "hook": a punchy on-screen caption for its opening, at most 10 words, in the language of the video; ' +
    '"reason": what makes this passage work, specific to its content, at most 15 words; and "score": 1 to 10.'
  );
}

export function clipSchema(passages: readonly Passage[], count: number): string {
  const clip = {
    type: 'object',
    properties: {
      // Only real passage numbers can be generated.
      passage: { type: 'integer', enum: passages.map((p) => p.id) },
      hook: { type: 'string' },
      reason: { type: 'string' },
      score: { type: 'integer' },
    },
    required: ['passage', 'hook', 'reason', 'score'],
  };
  // Exactly n: without maxItems small models keep listing until they run out
  // of tokens mid-array, and without minItems they often stop at one.
  const n = Math.max(1, Math.min(count, passages.length));
  return JSON.stringify({
    type: 'object',
    properties: { clips: { type: 'array', items: clip, minItems: n, maxItems: n } },
    required: ['clips'],
  });
}

export const META_SYSTEM = 'You write titles and hashtags for videos. Answer with JSON only.';

export function metaPrompt(sentences: readonly Sentence[], maxChars = 7000): string {
  let text = '';
  for (const s of sentences) {
    if (text.length + s.text.length + 1 > maxChars) break;
    text += (text ? ' ' : '') + s.text;
  }
  return (
    `Transcript of a video:\n\n${text}\n\n` +
    'Write "title": a title for this video that says what it is about, at most 8 words, in the language of the video; ' +
    'and "hashtags": 3 to 5 hashtags about its topic.'
  );
}

export function metaSchema(): string {
  return JSON.stringify({
    type: 'object',
    properties: {
      title: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
    },
    required: ['title', 'hashtags'],
  });
}

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .slice(0, max);

/** The model's picks, validated against the real passages. */
export function parseClips(raw: unknown, passages: readonly Passage[], pad = 0.15): ClipSuggestion[] {
  const data = (typeof raw === 'string' ? safeJson(raw) : raw) as { clips?: unknown[] } | null;
  let list: unknown[] = Array.isArray(data?.clips) ? data!.clips : [];
  // Output cut off mid-array: keep every pick that did finish.
  if (!list.length && typeof raw === 'string') list = salvagePicks(raw);
  // Best first, so a passage picked twice keeps its better write-up.
  list = [...list].sort((x, y) => Number((y as { score?: unknown }).score ?? 0) - Number((x as { score?: unknown }).score ?? 0));
  const byId = new Map(passages.map((p) => [p.id, p]));
  const used = new Set<number>();
  const out: ClipSuggestion[] = [];
  for (const item of list) {
    const c = item as Record<string, unknown>;
    const p = byId.get(Math.round(Number(c.passage)));
    if (!p || used.has(p.id) || p.end - p.start < MIN_CLIP * 0.75) continue;
    used.add(p.id);
    out.push({
      start: Math.max(0, p.start - pad),
      end: p.end + pad,
      hook: clean(c.hook, 120) || p.text.slice(0, 80),
      reason: clean(c.reason, 200),
      score: Math.min(10, Math.max(1, Math.round(Number(c.score) || 5))),
      opening: p.text.slice(0, 90),
    });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Complete `{...}` pick objects from output that stopped partway. */
export function salvagePicks(raw: string): unknown[] {
  const out: unknown[] = [];
  for (const m of raw.matchAll(/\{[^{}]*"passage"[^{}]*\}/g)) {
    try {
      out.push(JSON.parse(m[0]));
    } catch {
      /* incomplete object */
    }
  }
  return out;
}

export function parseMeta(raw: unknown): { title: string; hashtags: string[] } {
  const data = (typeof raw === 'string' ? safeJson(raw) : raw) as { title?: unknown; hashtags?: unknown } | null;
  const tags = Array.isArray(data?.hashtags) ? data!.hashtags : [];
  return {
    title: clean(data?.title, 80),
    hashtags: [
      ...new Set(
        tags.map((t) => '#' + String(t).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')).filter((t) => t.length > 1),
      ),
    ].slice(0, 5),
  };
}

function safeJson(input: string): unknown {
  // WebLLM prepends an empty <think></think> block when thinking is off.
  const s = input.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    // Some models wrap JSON in prose or code fences; take the outermost object.
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Best clips across chunks, highest score first, no overlaps. */
export function mergeClips(groups: ClipSuggestion[][], count = 3): ClipSuggestion[] {
  const all = groups.flat().sort((x, y) => y.score - x.score);
  const out: ClipSuggestion[] = [];
  for (const c of all) {
    if (out.length >= count) break;
    if (!out.some((o) => c.start < o.end && c.end > o.start)) out.push(c);
  }
  return out.sort((x, y) => x.start - y.start);
}
