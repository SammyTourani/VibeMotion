import { useEffect, useRef, useState } from 'react';
import { deriveEdl, useProject } from './derive';
import { edit, useEditor } from './store';
import { errorText } from './actions';
import { Progress, Segmented } from '../ui/controls';
import { sentencesOf, type ClipResult, type ClipSuggestion } from '../clips/prompt';
import { CLIP_MODELS, clipFinderSupported, clipModelCached, findClips, type ClipModelId } from '../clips/finder';
import { timecode } from '../lib/format';
import type { Edl } from '../edit/edl';

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; stage: 'download' | 'read'; fraction: number | null; detail: string }
  | { kind: 'done'; result: ClipResult }
  | { kind: 'error'; message: string };

const MIN_SOURCE = 90;
const MODEL_KEY = 'vibemotion:clip-model';
const DEFAULT_MODEL: ClipModelId = 'quick';

function setClip(range: { start: number; end: number } | null) {
  edit((p) => ({ ...p, clip: range }));
}

/** How long a source range lasts once pauses and fillers are cut. */
function keptWithin(edl: Edl, start: number, end: number): number {
  let sum = 0;
  for (const k of edl.kept) sum += Math.max(0, Math.min(end, k.end) - Math.max(start, k.start));
  return sum;
}

function opening(c: ClipSuggestion): string {
  const words = c.opening.split(' ');
  const head = words.slice(0, 9).join(' ');
  return words.length > 9 && !/[.?!…,;:]$/.test(head) ? `${head}…` : head;
}

const size = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`);

function savedModel(): ClipModelId {
  try {
    const v = localStorage.getItem(MODEL_KEY);
    return v && v in CLIP_MODELS ? (v as ClipModelId) : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

/**
 * "Find the best clips": an on-device language model reads the transcript
 * and suggests 20-60 s clips. Opt-in, and hidden when this device can't run
 * it or the video is too short to cut a clip from.
 */
export function ClipFinder() {
  const p = useProject();
  const analysis = useEditor((s) => s.analysis);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [cached, setCached] = useState<Partial<Record<ClipModelId, boolean>>>({});
  const [model, setModel] = useState<ClipModelId>(savedModel);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const attempts = useRef(0);
  const long = !!p && p.source.duration >= MIN_SOURCE;

  useEffect(() => {
    if (!long) return;
    let live = true;
    void (async () => {
      const ok = await clipFinderSupported();
      if (!live) return;
      setSupported(ok);
      if (!ok) return;
      const ids = Object.keys(CLIP_MODELS) as ClipModelId[];
      const found = await Promise.all(ids.map((id) => clipModelCached(id)));
      if (live) setCached(Object.fromEntries(ids.map((id, i) => [id, found[i]])));
    })();
    return () => {
      live = false;
    };
  }, [long]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!p || !long || !supported || !p.transcript) return null;

  const choose = (m: ClipModelId) => {
    setModel(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const run = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase({ kind: 'working', stage: 'download', fraction: null, detail: '' });
    try {
      const result = await findClips(
        sentencesOf(p.transcript!.words, p.textFixes),
        model,
        attempts.current++,
        (stage, fraction, detail) => setPhase({ kind: 'working', stage, fraction, detail }),
        abort.signal,
      );
      setCached((c) => ({ ...c, [model]: true }));
      setPhase({ kind: 'done', result });
    } catch (err) {
      if (abort.signal.aborted) return setPhase({ kind: 'idle' });
      const msg = errorText(err);
      // WebLLM caches the weights shard by shard, so a retry resumes.
      setPhase({
        kind: 'error',
        message: /network|fetch/i.test(msg)
          ? 'The download was interrupted. Try again to pick up where it stopped.'
          : `The model couldn’t run: ${msg}`,
      });
    }
  };

  const active = p.clip ?? null;
  const full = deriveEdl(p, analysis, false);
  const info = CLIP_MODELS[model];
  const models = Object.keys(CLIP_MODELS) as ClipModelId[];

  return (
    <div className="group clipfinder">
      <h3 className="group-title">Best clips</h3>
      {phase.kind === 'idle' || phase.kind === 'error' ? (
        <>
          <p className="ctl-hint">
            A language model reads the transcript on this device and suggests up to three 20 to 60 second clips, each
            with a hook, plus a title and hashtags.
          </p>
          {models.length > 1 ? (
            <Segmented<ClipModelId>
              label="Model"
              value={model}
              onChange={choose}
              options={models.map((id) => ({
                value: id,
                label: (
                  <span className="model-opt">
                    <b>{CLIP_MODELS[id].label}</b>
                    <small className="tnum">{size(CLIP_MODELS[id].downloadMB)}</small>
                  </span>
                ),
                title: CLIP_MODELS[id].blurb,
              }))}
            />
          ) : null}
          <p className="ctl-hint">
            {info.blurb}{' '}
            {cached[model]
              ? 'Already downloaded.'
              : models.length > 1
                ? 'Downloaded once, then cached by your browser.'
                : `It’s ${size(info.downloadMB)}, downloaded once, then cached by your browser.`}
          </p>
          {phase.kind === 'error' ? <p className="notice is-error">{phase.message}</p> : null}
          <button type="button" className="btn btn-secondary" onClick={() => void run()}>
            Find the best clips
          </button>
        </>
      ) : phase.kind === 'working' ? (
        <div className="job" role="status" aria-live="polite">
          <div className="job-line">
            <b>{phase.stage === 'download' ? 'Loading the language model' : 'Reading the transcript'}</b>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          </div>
          <Progress value={phase.fraction} label="Finding clips" />
          {phase.detail ? <p className="job-detail">{phase.detail.replace(/\s*\[.*?\]\s*/g, ' ').slice(0, 90)}</p> : null}
        </div>
      ) : (
        <>
          {phase.result.clips.length === 0 ? (
            <p className="notice">No clip stood out. Try again, or trim by hand on the timeline.</p>
          ) : (
            <ol className="clips">
              {phase.result.clips.map((c) => {
                const on = !!active && Math.abs(active.start - c.start) < 0.01 && Math.abs(active.end - c.end) < 0.01;
                return (
                  <li key={c.start} className={`clip ${on ? 'is-on' : ''}`}>
                    <div className="clip-time tnum">
                      {timecode(c.start, false)} to {timecode(c.end, false)}, {Math.round(keptWithin(full, c.start, c.end))} s
                      after cuts
                    </div>
                    <p className="clip-hook">{c.hook}</p>
                    <p className="ctl-hint">
                      Opens with “{opening(c)}”{c.reason ? <> {c.reason.replace(/[^.!?]$/, '$&.')}</> : null}
                    </p>
                    <button
                      type="button"
                      className={`btn btn-sm ${on ? 'btn-quiet' : 'btn-secondary'}`}
                      onClick={() => setClip(on ? null : { start: c.start, end: c.end })}
                    >
                      {on ? 'Use the whole video' : 'Use this clip'}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {phase.result.title || phase.result.hashtags.length ? (
            <div className="clip-meta">
              {phase.result.title ? (
                <p>
                  <span className="summary-k">Title</span> {phase.result.title}
                </p>
              ) : null}
              {phase.result.hashtags.length ? (
                <p>
                  <span className="summary-k">Hashtags</span> {phase.result.hashtags.join(' ')}
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText([phase.result.title, phase.result.hashtags.join(' ')].filter(Boolean).join('\n'))
                    .catch(() => undefined)
                }
              >
                Copy title and hashtags
              </button>
            </div>
          ) : null}
          <div className="clip-again">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void run()}>
              Suggest again
            </button>
            {models.length > 1 ? (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPhase({ kind: 'idle' })}>
                Change model
              </button>
            ) : null}
          </div>
        </>
      )}
      {active && phase.kind !== 'done' ? (
        <p className="notice">
          Using {timecode(active.start, false)} to {timecode(active.end, false)} only.{' '}
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setClip(null)}>
            Use the whole video
          </button>
        </p>
      ) : null}
    </div>
  );
}
