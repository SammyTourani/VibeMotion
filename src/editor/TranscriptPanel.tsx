import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import { useEditor, setUi } from './store';
import { useEdl, useProject } from './derive';
import {
  cancelTranscription,
  cutRange,
  cutWords,
  fixWord,
  restoreRange,
  restoreWords,
  toggleEmphasis,
  transcribe,
} from './actions';
import { transport } from './transport';
import type { Edl, WordStatus } from '../edit/edl';
import type { Word } from '../project/types';
import { Progress } from '../ui/controls';
import { SearchIcon } from '../ui/icons';
import { duration } from '../lib/format';
import { languageName } from '../asr/models';

interface Gap {
  after: number;
  start: number;
  end: number;
  cut: number;
}

function gapsOf(words: readonly Word[], edl: Edl, total: number): Gap[] {
  const out: Gap[] = [];
  const cutIn = (a: number, b: number) => {
    let s = 0;
    for (const c of edl.cuts) {
      if (c.start >= b) break;
      s += Math.max(0, Math.min(c.end, b) - Math.max(c.start, a));
    }
    return s;
  };
  for (let i = -1; i < words.length; i++) {
    const start = i < 0 ? 0 : words[i]!.end;
    const end = i + 1 < words.length ? words[i + 1]!.start : total;
    if (end - start >= 0.5) out.push({ after: i, start, end, cut: cutIn(start, end) });
  }
  return out;
}

function paragraphBreaks(words: readonly Word[]): Set<number> {
  const breaks = new Set<number>();
  let since = 0;
  for (let i = 0; i < words.length - 1; i++) {
    since++;
    const sentence = /[.?!…]["')\]]*$/.test(words[i]!.text);
    const gap = words[i + 1]!.start - words[i]!.end;
    if (sentence && (gap > 1.2 || since > 70)) {
      breaks.add(i);
      since = 0;
    }
  }
  return breaks;
}

interface ListProps {
  words: readonly Word[];
  status: readonly WordStatus[];
  gaps: readonly Gap[];
  fixes: Readonly<Record<string, string>>;
  emphasized: ReadonlySet<string>;
  sel: { a: number; b: number } | null;
  matches: ReadonlySet<number>;
  editing: number | null;
  onCommitEdit: (i: number, text: string | null) => void;
}

const WordList = memo(function WordList(props: ListProps) {
  const { words, status, gaps, fixes, emphasized, sel, matches, editing } = props;
  const breaks = useMemo(() => paragraphBreaks(words), [words]);
  const gapAfter = useMemo(() => {
    const m = new Map<number, Gap>();
    for (const g of gaps) m.set(g.after, g);
    return m;
  }, [gaps]);

  const paras: ReactElement[][] = [[]];
  const push = (el: ReactElement) => paras[paras.length - 1]!.push(el);
  const gapChip = (g: Gap) => {
    const removed = g.cut > 0.2;
    return (
      <button
        key={`g${g.after}`}
        type="button"
        className={`pause ${removed ? 'is-cut' : ''}`}
        data-gap={g.after}
        title={removed ? `Pause shortened by ${duration(g.cut)}. Click to keep it.` : `A ${duration(g.end - g.start)} pause. Click to shorten it.`}
      >
        {removed ? `−${g.cut.toFixed(1)}s` : `${(g.end - g.start).toFixed(1)}s`}
      </button>
    );
  };

  const lead = gapAfter.get(-1);
  if (lead) push(gapChip(lead));
  words.forEach((w, i) => {
    const st = status[i] ?? 'kept';
    const text = fixes[w.id] ?? w.text;
    const cls = ['w'];
    if (st !== 'kept') cls.push(`is-${st}`);
    if (sel && i >= sel.a && i <= sel.b) cls.push('is-sel');
    if (emphasized.has(w.id)) cls.push('is-emph');
    if (fixes[w.id]) cls.push('is-fixed');
    if (matches.has(i)) cls.push('is-match');
    if (editing === i) {
      push(
        <input
          key={w.id}
          className="w-edit"
          defaultValue={text}
          aria-label={`Fix the spelling of "${text}"`}
          size={Math.max(3, text.length + 1)}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') props.onCommitEdit(i, e.currentTarget.value);
            else if (e.key === 'Escape') props.onCommitEdit(i, null);
            e.stopPropagation();
          }}
          onBlur={(e) => props.onCommitEdit(i, e.currentTarget.value)}
        />,
      );
    } else {
      push(
        <span
          key={w.id}
          className={cls.join(' ')}
          data-i={i}
          title={fixes[w.id] ? `Was "${w.text}"` : st === 'filler' ? 'Filler word, cut automatically' : undefined}
        >
          {text}
        </span>,
      );
    }
    push(<span key={`s${w.id}`}> </span>);
    const g = gapAfter.get(i);
    if (g) push(gapChip(g));
    if (breaks.has(i)) paras.push([]);
  });

  return (
    <>
      {paras.map((p, k) => (
        <p key={k} className="para">
          {p}
        </p>
      ))}
    </>
  );
});

function JobBanner() {
  const job = useEditor((s) => s.jobs.asr);
  const audio = useEditor((s) => s.jobs.audio);
  const p = useProject();
  if (audio.state === 'running') {
    return (
      <div className="job" role="status">
        <div className="job-line">
          <b>Reading audio</b>
        </div>
        <Progress value={audio.progress} label="Reading audio" />
      </div>
    );
  }
  if (job.state === 'running') {
    return (
      <div className="job" role="status" aria-live="polite">
        <div className="job-line">
          <b>{job.label}</b>
          <button type="button" className="btn btn-quiet btn-sm" onClick={cancelTranscription}>
            Cancel
          </button>
        </div>
        <Progress value={job.progress} label={job.label} />
        {job.detail ? <p className="job-detail tnum">{job.detail}</p> : null}
      </div>
    );
  }
  if (job.state === 'error' || job.state === 'cancelled') {
    return (
      <div className={`job ${job.state === 'error' ? 'is-error' : ''}`} role="status">
        <div className="job-line">
          <b>{job.state === 'error' ? "Transcription didn't finish" : 'Transcription stopped'}</b>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void transcribe()}>
            {p?.transcript ? 'Transcribe again' : 'Transcribe'}
          </button>
        </div>
        {job.error ? <p className="job-detail">{job.error}</p> : null}
      </div>
    );
  }
  return null;
}

export function TranscriptPanel() {
  const p = useProject();
  const edl = useEdl();
  const live = useEditor((s) => s.liveWords);
  const sel = useEditor((s) => s.selection);
  const search = useEditor((s) => s.ui.search);
  const emphasize = useEditor((s) => s.ui.emphasize);
  const [editing, setEditing] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ anchor: number; moved: boolean; shift: boolean } | null>(null);
  const userScrollAt = useRef(0);

  const words = p?.transcript?.words ?? null;
  const gaps = useMemo(() => (words && edl && p ? gapsOf(words, edl, p.source.duration) : []), [words, edl, p]);
  const emphasized = useMemo(() => new Set(p?.captions.emphasized ?? []), [p?.captions.emphasized]);
  const matches = useMemo(() => {
    const m = new Set<number>();
    const q = search.trim().toLowerCase();
    if (!q || !words) return m;
    const fixes = p?.textFixes ?? {};
    const qs = q.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const ok = qs.every((part, k) => {
        const w = words[i + k];
        return !!w && (fixes[w.id] ?? w.text).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '').includes(part.replace(/[^\p{L}\p{N}']/gu, ''));
      });
      if (ok) for (let k = 0; k < qs.length; k++) m.add(i + k);
    }
    return m;
  }, [search, words, p?.textFixes]);

  // Highlight the word being spoken, without re-rendering the list.
  useEffect(() => {
    if (!words) return;
    let current: Element | null = null;
    let last = -2;
    const onTick = () => {
      const t = transport.src;
      let lo = 0;
      let hi = words.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (words[mid]!.start <= t + 0.02) {
          idx = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (idx >= 0 && t > words[idx]!.end + 0.6) idx = -1;
      if (idx === last) return;
      last = idx;
      current?.classList.remove('is-now');
      current = idx >= 0 ? (bodyRef.current?.querySelector(`[data-i="${idx}"]`) ?? null) : null;
      current?.classList.add('is-now');
      if (current && transport.playing && Date.now() - userScrollAt.current > 2500) {
        const box = bodyRef.current!.getBoundingClientRect();
        const r = current.getBoundingClientRect();
        if (r.top < box.top + 40 || r.bottom > box.bottom - 40) current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    onTick();
    return transport.subscribe(onTick);
  }, [words, edl, emphasized, sel, matches, editing]);

  const indexAt = (el: EventTarget | null): number | null => {
    const span = (el as HTMLElement | null)?.closest?.('[data-i]') as HTMLElement | null;
    return span ? Number(span.dataset.i) : null;
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const gapEl = (e.target as HTMLElement).closest('[data-gap]') as HTMLElement | null;
    if (gapEl || !words) return;
    const i = indexAt(e.target);
    if (i === null) {
      useEditor.setState({ selection: null });
      return;
    }
    e.preventDefault();
    if (e.shiftKey && sel) {
      const anchor = drag.current?.anchor ?? sel.a;
      useEditor.setState({ selection: { a: Math.min(anchor, i), b: Math.max(anchor, i) } });
      drag.current = { anchor, moved: true, shift: true };
    } else {
      drag.current = { anchor: i, moved: false, shift: false };
    }
    const move = (ev: MouseEvent) => {
      const j = indexAt(document.elementFromPoint(ev.clientX, ev.clientY));
      if (j === null || !drag.current) return;
      if (j !== drag.current.anchor || drag.current.moved) {
        drag.current.moved = true;
        const a = drag.current.anchor;
        useEditor.setState({ selection: { a: Math.min(a, j), b: Math.max(a, j) }, rangeSel: null });
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const d = drag.current;
      if (d && !d.moved && !d.shift) {
        if (emphasize) toggleEmphasis(words[i]!.id);
        else {
          useEditor.setState({ selection: { a: i, b: i }, rangeSel: null });
          transport.seekSrc(words[i]!.start + 0.001);
        }
      }
      if (d) drag.current = { ...d, anchor: d.anchor };
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onClick = (e: ReactMouseEvent) => {
    const gapEl = (e.target as HTMLElement).closest('[data-gap]') as HTMLElement | null;
    if (!gapEl || !p) return;
    const g = gaps.find((x) => x.after === Number(gapEl.dataset.gap));
    if (!g) return;
    if (g.cut > 0.2) restoreRange(g.start, g.end);
    else {
      const pad = p.tighten.padding;
      cutRange(g.start + pad, g.end - pad);
    }
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    const i = indexAt(e.target);
    if (i !== null && !emphasize) setEditing(i);
  };

  const commitEdit = (i: number, text: string | null) => {
    setEditing(null);
    if (text !== null && words?.[i]) fixWord(words[i].id, text);
  };

  const stats = useMemo(() => {
    if (!words || !edl) return null;
    let cut = 0;
    for (const s of edl.wordStatus) if (s !== 'kept') cut++;
    return { total: words.length, cut };
  }, [words, edl]);

  const selStatus = useMemo(() => {
    if (!sel || !edl) return null;
    let kept = 0;
    for (let i = sel.a; i <= sel.b; i++) if (edl.wordStatus[i] === 'kept') kept++;
    return { count: sel.b - sel.a + 1, kept };
  }, [sel, edl]);

  const goToMatch = (dir: 1 | -1) => {
    if (!words || matches.size === 0) return;
    const list = [...matches].sort((a, b) => a - b);
    const t = transport.src;
    const next =
      dir === 1 ? (list.find((i) => words[i]!.start > t + 0.05) ?? list[0]!) : ([...list].reverse().find((i) => words[i]!.start < t - 0.05) ?? list[list.length - 1]!);
    transport.seekSrc(words[next]!.start + 0.001);
    bodyRef.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <section className="transcript" aria-labelledby="transcript-h">
      <header className="panel-head">
        <h2 id="transcript-h">Transcript</h2>
        {stats ? (
          <span className="panel-meta tnum">
            {stats.total} words
            {stats.cut ? <span className="meta-cut">, {stats.cut} cut</span> : null}
            {p?.transcript ? `, ${languageName(p.transcript.language)}` : ''}
          </span>
        ) : null}
        <label className="search">
          <SearchIcon />
          <span className="visually-hidden">Search the transcript</span>
          <input
            id="transcript-search"
            type="search"
            placeholder="Search"
            value={search}
            disabled={!words}
            onChange={(e) => setUi({ search: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                goToMatch(e.shiftKey ? -1 : 1);
              }
              if (e.key === 'Escape') {
                setUi({ search: '' });
                e.currentTarget.blur();
              }
            }}
          />
          {search ? <span className="search-count tnum">{matches.size ? `${matches.size}` : 'none'}</span> : null}
        </label>
      </header>

      <JobBanner />

      {sel && selStatus ? (
        <div className="selbar" role="toolbar" aria-label="Selected words">
          <span className="tnum">
            {selStatus.count} {selStatus.count === 1 ? 'word' : 'words'} selected
          </span>
          {selStatus.kept > 0 ? (
            <button type="button" className="btn btn-sm btn-cut" onClick={() => cutWords(sel.a, sel.b)}>
              Cut <kbd>Delete</kbd>
            </button>
          ) : null}
          {selStatus.kept < selStatus.count ? (
            <button type="button" className="btn btn-sm btn-keep" onClick={() => restoreWords(sel.a, sel.b)}>
              Restore
            </button>
          ) : null}
          {sel.a === sel.b ? (
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing(sel.a)}>
              Fix spelling
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => useEditor.setState({ selection: null })}>
            Done
          </button>
        </div>
      ) : null}

      {emphasize ? (
        <div className="selbar is-emph-mode" role="status">
          <span>Click words to highlight them in the captions.</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setUi({ emphasize: false })}>
            Done
          </button>
        </div>
      ) : null}

      <div
        className={`transcript-body ${emphasize ? 'is-emphasizing' : ''}`}
        ref={bodyRef}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onWheel={() => (userScrollAt.current = Date.now())}
        tabIndex={0}
        aria-label="Transcript. Use the arrow keys to move between words, Shift with the arrows to select, Delete to cut."
      >
        {words && edl ? (
          words.length ? (
            <WordList
              words={words}
              status={edl.wordStatus}
              gaps={gaps}
              fixes={p!.textFixes}
              emphasized={emphasized}
              sel={sel}
              matches={matches}
              editing={editing}
              onCommitEdit={commitEdit}
            />
          ) : (
            <p className="transcript-empty">No speech found in this video. Silence removal and captions need something said.</p>
          )
        ) : live && live.length ? (
          <p className="para is-live">
            {live.map((w) => (
              <span key={w.id}>{w.text} </span>
            ))}
            <span className="caret" aria-hidden="true" />
          </p>
        ) : (
          <div className="transcript-placeholder" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </section>
  );
}

