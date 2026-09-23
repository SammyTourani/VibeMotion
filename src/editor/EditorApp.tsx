import { useEffect, useState } from 'react';
import './editor.css';
import { takePending } from '../app/handoff';
import { useEditor, getState, setUi, undo, redo } from './store';
import { initEditor, openFile, openSample, startAutosave, toggleWords, cutRange } from './actions';
import { transport } from './transport';
import { TopBar } from './TopBar';
import { EmptyState } from './EmptyState';
import { Preview } from './Preview';
import { TranscriptPanel } from './TranscriptPanel';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { ExportDialog } from './ExportDialog';
import { ShortcutSheet } from './ShortcutSheet';
import { RestoreBanner } from './RestoreBanner';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (isTyping(e)) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (s.history) setUi({ exportOpen: true });
        return;
      }
      if (mod && e.key.toLowerCase() === 'f') {
        const input = document.getElementById('transcript-search') as HTMLInputElement | null;
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }
      if (isTyping(e) || mod || e.altKey) return;
      if (s.ui.exportOpen || s.ui.shortcutsOpen) return;
      const p = s.history?.present;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          transport.setRate(1);
          transport.toggle();
          break;
        case 'k':
        case 'K':
          transport.pause();
          transport.setRate(1);
          break;
        case 'l':
        case 'L': {
          if (transport.playing) transport.setRate(Math.min(2, transport.rate + 0.5));
          else {
            transport.setRate(1);
            transport.play();
          }
          break;
        }
        case 'j':
        case 'J':
          transport.seekOut(Math.max(0, transport.out - 3));
          break;
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!p?.transcript) break;
          e.preventDefault();
          const words = p.transcript.words;
          const t = transport.src;
          let idx: number;
          if (e.key === 'ArrowRight') {
            idx = words.findIndex((w) => w.start > t + 0.01);
            if (idx < 0) idx = words.length - 1;
          } else {
            idx = -1;
            for (let i = words.length - 1; i >= 0; i--) {
              if (words[i]!.start < t - 0.05) {
                idx = i;
                break;
              }
            }
            if (idx < 0) idx = 0;
          }
          const w = words[idx];
          if (!w) break;
          if (e.shiftKey) {
            const sel = s.selection ?? { a: idx, b: idx };
            const anchor = sel.a;
            useEditor.setState({ selection: { a: Math.min(anchor, idx), b: Math.max(anchor, idx) } });
          }
          transport.seekSrc(w.start + 0.001);
          break;
        }
        case 'Delete':
        case 'Backspace': {
          if (s.selection) {
            e.preventDefault();
            toggleWords(s.selection.a, s.selection.b);
          } else if (s.rangeSel) {
            e.preventDefault();
            cutRange(s.rangeSel.start, s.rangeSel.end);
            useEditor.setState({ rangeSel: null });
          }
          break;
        }
        case 'Escape':
          useEditor.setState({ selection: null, rangeSel: null });
          break;
        case '?':
          setUi({ shortcutsOpen: true });
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useGlobalDrop() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => /^(video|audio)\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
      if (file) void openFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return over;
}

export default function EditorApp() {
  const phase = useEditor((s) => s.phase);
  const dragging = useGlobalDrop();
  useShortcuts();

  useEffect(() => {
    void initEditor();
    const stop = startAutosave();
    const pending = takePending();
    if (pending?.kind === 'sample') void openSample();
    else if (pending?.kind === 'file') void openFile(pending.file);
    return stop;
  }, []);

  const open = phase === 'open';
  return (
    <div className={`editor ${open ? 'is-open' : ''}`}>
      <TopBar />
      {open ? (
        <>
          <p className="narrow-note">VibeMotion works best on a laptop or desktop. Everything still works here.</p>
          <RestoreBanner />
          <main className="workspace">
            <TranscriptPanel />
            <Preview />
            <Inspector />
          </main>
          <Timeline />
          <ExportDialog />
        </>
      ) : (
        <EmptyState />
      )}
      <ShortcutSheet />
      {dragging ? (
        <div className="drop-veil" aria-hidden="true">
          <p>Drop to open this video</p>
        </div>
      ) : null}
    </div>
  );
}
