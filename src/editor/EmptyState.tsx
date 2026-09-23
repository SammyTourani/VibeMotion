import { useEffect, useRef, useState } from 'react';
import { useEditor } from './store';
import { openFile, openSample } from './actions';
import { listRecent, deleteProject } from '../project/persist';
import { duration, relativeDate } from '../lib/format';
import type { Capabilities } from '../lib/capabilities';
import { TrashIcon } from '../ui/icons';

type Recent = Awaited<ReturnType<typeof listRecent>>[number];

function CapabilityList({ caps }: { caps: Capabilities | null }) {
  if (!caps) return <p className="caps-loading">Checking what this browser can do…</p>;
  const rows: { ok: boolean | 'partial'; title: string; text: string }[] = [
    caps.webgpu
      ? { ok: true, title: 'Transcription on your GPU', text: 'WebGPU is available, so transcription runs fast.' }
      : {
          ok: 'partial',
          title: 'Transcription on your CPU',
          text: "No WebGPU here, so transcription uses WebAssembly. It works, but it's several times slower. Chrome or Edge on a recent laptop is fastest.",
        },
    caps.webcodecs && caps.avc
      ? { ok: true, title: 'MP4 export', text: 'H.264 encoding through WebCodecs.' }
      : {
          ok: false,
          title: 'MP4 export',
          text: "This browser can't encode H.264 video. Use a current Chrome, Edge or Safari to export.",
        },
    caps.aacNative
      ? { ok: true, title: 'AAC audio', text: 'Native AAC encoding.' }
      : {
          ok: 'partial',
          title: 'AAC audio',
          text: 'No native AAC encoder here, so a built-in one (about 1 MB) loads when you export.',
        },
    {
      ok: caps.indexedDb,
      title: 'Autosave',
      text: caps.indexedDb ? 'Edits save in this browser as you work.' : 'Storage is blocked, so edits won’t autosave.',
    },
  ];
  return (
    <ul className="caps">
      {rows.map((r) => (
        <li key={r.title} className={`cap ${r.ok === true ? 'is-ok' : r.ok === 'partial' ? 'is-partial' : 'is-no'}`}>
          <span className="cap-dot" aria-hidden="true" />
          <div>
            <b>{r.title}</b>
            <span className="visually-hidden">: {r.ok === true ? 'works' : r.ok === 'partial' ? 'works, slower' : 'unavailable'}.</span>
            <p>{r.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState() {
  const phase = useEditor((s) => s.phase);
  const error = useEditor((s) => s.openError);
  const caps = useEditor((s) => s.caps);
  const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [reselect, setReselect] = useState<Recent | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);

  useEffect(() => {
    void listRecent().then(setRecent);
  }, [phase]);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (reselect) {
      const fp = `${file.name}|${file.size}|${file.lastModified}`;
      if (fp !== reselect.fingerprint) {
        setMismatch(`That's not the same file as "${reselect.name}". Opening it as a new video.`);
      }
      setReselect(null);
    }
    void openFile(file);
  };

  const opening = phase === 'opening';
  return (
    <main className="empty">
      <section className="empty-main">
        <h1 className="empty-title">Start with a video</h1>
        <p className="empty-lede">
          A clip of you talking to camera works best: a phone recording, a webcam take, a podcast cut. VibeMotion
          transcribes it, cuts the pauses and filler words, frames it vertically and captions it.
        </p>

        <div
          className={`dropzone ${opening ? 'is-busy' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !opening && input.current?.click()}
          role="presentation"
        >
          {opening ? (
            <div className="dropzone-busy" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Opening the video…</p>
            </div>
          ) : (
            <>
              <p className="dropzone-title">Drop a video here</p>
              <p className="dropzone-sub">MP4, MOV or WebM. It stays on this device.</p>
              <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => input.current?.click()}>
                  Choose a video
                </button>
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => void openSample()}>
                  Try the sample clip
                </button>
              </div>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
            className="visually-hidden"
            tabIndex={-1}
            onChange={(e) => {
              onPick(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </div>

        {error ? (
          <div className="notice is-error" role="alert">
            <b>That video didn't open.</b> {error}
          </div>
        ) : null}
        {mismatch ? (
          <div className="notice" role="status">
            {mismatch}
          </div>
        ) : null}
        {reselect ? (
          <div className="notice" role="status">
            To continue <b>{reselect.name}</b>, choose that file again. Videos never leave your device, so VibeMotion
            can't reopen it on its own.
            <button type="button" className="btn btn-primary btn-sm" onClick={() => input.current?.click()}>
              Choose {reselect.name}
            </button>
          </div>
        ) : null}
      </section>

      <aside className="empty-side">
        {recent.length > 0 ? (
          <section className="recent" aria-labelledby="recent-h">
            <h2 id="recent-h">Recent</h2>
            <ul>
              {recent.map((r) => (
                <li key={r.fingerprint}>
                  <button
                    type="button"
                    className="recent-item"
                    onClick={() => {
                      setMismatch(null);
                      setReselect(r);
                    }}
                  >
                    <span className="recent-name">{r.name}</span>
                    <span className="recent-meta tnum">
                      {duration(r.duration)}, edited {relativeDate(r.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Forget ${r.name}`}
                    onClick={() => void deleteProject(r.fingerprint).then(() => listRecent().then(setRecent))}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="caps-h">
          <h2 id="caps-h">On this browser</h2>
          <CapabilityList caps={caps} />
        </section>
      </aside>
    </main>
  );
}
