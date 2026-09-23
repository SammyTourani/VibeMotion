import { Mark, KeyboardIcon, RedoIcon, UndoIcon, CloseIcon } from '../ui/icons';
import { Segmented } from '../ui/controls';
import { canRedo, canUndo } from '../edit/history';
import type { Aspect } from '../project/types';
import { useEditor, setUi, undo, redo } from './store';
import { useEdl, useProject } from './derive';
import { setFrame, closeProject } from './actions';
import { duration } from '../lib/format';
import { navigate } from '../app/router';

const ASPECTS: { value: Aspect; label: string; title: string }[] = [
  { value: '9:16', label: '9:16', title: 'Vertical: TikTok, Reels, Shorts' },
  { value: '1:1', label: '1:1', title: 'Square' },
  { value: '4:5', label: '4:5', title: 'Portrait feed post' },
  { value: '16:9', label: '16:9', title: 'Landscape: YouTube, LinkedIn' },
];

function AspectGlyph({ a }: { a: Aspect }) {
  const [w, h] = a.split(':').map(Number) as [number, number];
  const s = 12 / Math.max(w, h);
  return <span className="aspect-glyph" style={{ width: w * s, height: h * s }} aria-hidden="true" />;
}

export function TopBar() {
  const history = useEditor((s) => s.history);
  const phase = useEditor((s) => s.phase);
  const p = useProject();
  const edl = useEdl();
  const cut = p && edl ? p.source.duration - edl.outDuration : 0;

  return (
    <header className="topbar">
      <a
        className="brand"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          navigate('landing');
        }}
      >
        <Mark size={18} />
        <span>VibeMotion</span>
      </a>
      {p && phase === 'open' ? (
        <div className="doc">
          <span className="doc-name" title={p.source.name}>
            {p.source.name}
          </span>
          {edl ? (
            <span className="doc-stats tnum">
              <b>{duration(edl.outDuration)}</b> from {duration(p.source.duration)}
              {cut > 0.05 ? <span className="doc-cut">, {duration(cut)} cut</span> : null}
            </span>
          ) : null}
          <button type="button" className="icon-btn doc-close" aria-label="Close this video" onClick={closeProject}>
            <CloseIcon />
          </button>
        </div>
      ) : (
        <div className="doc" />
      )}
      {p && phase === 'open' ? (
        <div className="topbar-tools">
          <Segmented
            label="Output shape"
            hideLabel
            size="sm"
            value={p.frame.aspect}
            onChange={(v) => setFrame({ aspect: v })}
            options={ASPECTS.map((a) => ({
              value: a.value,
              title: a.title,
              label: (
                <>
                  <AspectGlyph a={a.value} />
                  <span>{a.label}</span>
                </>
              ),
            }))}
          />
          <div className="topbar-sep" />
          <button type="button" className="icon-btn" aria-label="Undo" title="Undo (Cmd/Ctrl+Z)" disabled={!history || !canUndo(history)} onClick={undo}>
            <UndoIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Redo" title="Redo (Shift+Cmd/Ctrl+Z)" disabled={!history || !canRedo(history)} onClick={redo}>
            <RedoIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setUi({ shortcutsOpen: true })}>
            <KeyboardIcon />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setUi({ exportOpen: true })} disabled={!edl || edl.outDuration <= 0}>
            Export
          </button>
        </div>
      ) : (
        <div className="topbar-tools">
          <button type="button" className="icon-btn" aria-label="Keyboard shortcuts" onClick={() => setUi({ shortcutsOpen: true })}>
            <KeyboardIcon />
          </button>
        </div>
      )}
    </header>
  );
}
