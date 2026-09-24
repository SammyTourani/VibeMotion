import { describe, expect, it } from 'vitest';
import {
  chunkPassages,
  clipPrompt,
  clipSchema,
  mergeClips,
  metaPrompt,
  parseClips,
  parseMeta,
  passagesOf,
  sentencesOf,
  type Passage,
} from './prompt';
import type { Word } from '../project/types';

/** `count` sentences of 4 words, each 4 s long; `pauses` adds seconds of silence after a sentence. */
function transcript(pauses: Record<number, number> = {}, count = 40): Word[] {
  const words: Word[] = [];
  let t = 0;
  for (let s = 0; s < count; s++) {
    for (let k = 0; k < 4; k++) {
      words.push({ id: `w${words.length}`, text: k === 3 ? `end${s}.` : `word${s}`, start: t, end: t + 0.9 });
      t += 1;
    }
    t += pauses[s] ?? 0;
  }
  return words;
}

describe('sentences and passages', () => {
  it('groups words into sentences with times', () => {
    const s = sentencesOf(transcript());
    expect(s.length).toBe(40);
    expect(s[1]).toEqual({ i: 1, start: 4, end: 7.9, text: 'word1 word1 word1 end1.' });
  });

  it('splits run-on sentences', () => {
    const words = Array.from({ length: 70 }, (_, i) => ({ id: `w${i}`, text: 'and', start: i, end: i + 0.5 }));
    expect(sentencesOf(words, {}, 28).map((s) => s.text.split(' ').length)).toEqual([28, 28, 14]);
  });

  it('cuts the transcript into 20-60 s passages that cover it in order', () => {
    const sentences = sentencesOf(transcript());
    const passages = passagesOf(sentences);
    expect(passages.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    for (const p of passages) {
      expect(p.end - p.start).toBeGreaterThanOrEqual(20);
      expect(p.end - p.start).toBeLessThanOrEqual(60);
    }
    expect(passages[0]!.start).toBe(0);
    expect(passages.at(-1)!.end).toBe(sentences.at(-1)!.end);
    expect(passages.map((p) => p.text).join(' ')).toBe(sentences.map((s) => s.text).join(' '));
  });

  it('gives a 90 s talk three passages', () => {
    const passages = passagesOf(sentencesOf(transcript({}, 22)));
    expect(passages.map((p) => Math.round(p.end - p.start))).toEqual([36, 28, 24]);
  });

  it('breaks passages at long pauses', () => {
    const sentences = sentencesOf(transcript({ 6: 1.5 }));
    const passages = passagesOf(sentences);
    expect(passages[0]!.end).toBe(sentences[6]!.end);
    expect(passages[1]!.start).toBe(sentences[7]!.start);
  });

  it('chunks passages to fit the context', () => {
    const passages = passagesOf(sentencesOf(transcript()));
    const chunks = chunkPassages(passages, 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(passages);
  });
});

describe('prompts', () => {
  const passages = passagesOf(sentencesOf(transcript()));

  it('numbers passages with their times and asks for at most what exists', () => {
    const p = clipPrompt(passages, 3);
    expect(p).toContain('[1] (0:00-0:35) word0 word0 word0 end0.');
    expect(p).toContain('Choose the 3 passages');
    expect(clipPrompt(passages.slice(0, 2), 3)).toContain('Choose the 2 passages');
    expect(clipPrompt(passages.slice(0, 1), 3)).toContain('Choose the 1 passage that');
  });

  it('only lets the model name real passages, and caps the count', () => {
    const schema = JSON.parse(clipSchema(passages, 3));
    expect(schema.properties.clips.items.properties.passage.enum).toEqual([1, 2, 3, 4, 5]);
    expect(schema.properties.clips).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(JSON.parse(clipSchema(passages.slice(0, 2), 3)).properties.clips).toMatchObject({ minItems: 2, maxItems: 2 });
  });

  it('asks for the title without mentioning clips, within the context budget', () => {
    const p = metaPrompt(sentencesOf(transcript()), 100);
    expect(p).toContain('word0 word0 word0 end0.');
    expect(p).not.toContain('end39.');
    expect(p.toLowerCase()).not.toContain('clip');
  });
});

describe('parseClips', () => {
  const passages: Passage[] = passagesOf(sentencesOf(transcript()));

  it('turns picked passages into timed clips', () => {
    const clips = parseClips(JSON.stringify({ clips: [{ passage: 2, hook: 'Watch this', reason: 'Strong open', score: 8 }] }), passages, 0);
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ start: passages[1]!.start, end: passages[1]!.end, hook: 'Watch this', score: 8 });
    expect(clips[0]!.opening).toBe(passages[1]!.text.slice(0, 90));
  });

  it('drops unknown passages and keeps the better write-up of a repeat', () => {
    const clips = parseClips(
      {
        clips: [
          { passage: 9, hook: 'nope', reason: 'r', score: 9 },
          { passage: 1, hook: 'low', reason: 'r', score: 3 },
          { passage: 1, hook: 'high', reason: 'r', score: 7 },
          { passage: 3, hook: 'third', reason: 'r', score: 5 },
        ],
      },
      passages,
      0,
    );
    expect(clips.map((c) => c.hook)).toEqual(['high', 'third']);
  });

  it('keeps the finished picks from output cut off mid-array', () => {
    const raw =
      '<think>\n\n</think>\n\n{"clips": [{"passage": 1, "hook": "a", "reason": "r", "score": 6}, ' +
      '{"passage": 4, "hook": "b", "reason": "r", "score": 9}, {"passage": 2, "hook":';
    expect(parseClips(raw, passages, 0).map((c) => c.hook)).toEqual(['a', 'b']);
  });

  it('survives prose around the JSON and garbage', () => {
    expect(parseClips('Sure! {"clips":[{"passage":1,"hook":"h","reason":"r","score":3}]} Hope that helps', passages, 0)).toHaveLength(1);
    expect(parseClips('not json', passages)).toEqual([]);
  });

  it('cleans title and hashtags', () => {
    expect(parseMeta('<think></think>{"title": " \\"Edit in your browser\\" ", "hashtags": ["#video editing", "ai", "##ai", "#"]}')).toEqual({
      title: 'Edit in your browser',
      hashtags: ['#videoediting', '#ai'],
    });
  });

  it('merges chunk results by score without overlaps', () => {
    const c = (start: number, score: number) => ({ start, end: start + 30, hook: '', reason: '', score, opening: '' });
    const best = mergeClips([[c(0, 5), c(100, 9)], [c(10, 8), c(200, 7), c(300, 2)]]);
    expect(best.map((x) => x.start)).toEqual([10, 100, 200]);
  });
});
