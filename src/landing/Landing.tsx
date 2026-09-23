import { useEffect, useRef, useState } from 'react';
import './landing.css';
import { navigate } from '../app/router';
import { setPending } from '../app/handoff';
import { Mark } from '../ui/icons';
import { Hero } from './Hero';
import { Pipeline } from './Pipeline';
import { StyleLoops } from './StyleLoops';

const REPO = 'https://github.com/SammyTourani/VibeMotion';

function openEditorWith(file: File | null) {
  if (file) setPending({ kind: 'file', file });
  navigate('edit');
}

function Privacy() {
  const rows: [step: string, uses: string, without: string][] = [
    ['Transcription', 'WebGPU', 'Runs on the CPU with WebAssembly. It works, several times slower.'],
    ['Reading and exporting video', 'WebCodecs with an H.264 encoder', 'Export isn’t available, and the editor tells you so.'],
    ['AAC audio', 'WebCodecs AAC encoder', 'A built-in AAC encoder (about 1 MB) takes over.'],
    ['Face tracking', 'WebGL and WebAssembly', 'The crop stays centered, and you can place it by hand.'],
    ['Autosave', 'IndexedDB', 'Edits aren’t kept between visits.'],
  ];
  return (
    <section className="lp-section lp-privacy" aria-labelledby="privacy-h">
      <h2 id="privacy-h" className="lp-h2">
        Where your video goes: nowhere.
      </h2>
      <div className="lp-privacy-body">
        <div className="lp-prose">
          <p>
            VibeMotion is a static web page. There is no server behind it that could receive your video: transcription,
            cutting, reframing, captions and export all happen in this browser tab, on your computer.
          </p>
          <p>
            The first time you transcribe, your browser downloads the speech model from Hugging Face (about 120 MB on
            most GPUs) and keeps it. Face tracking fetches a small model from Google and its runtime from jsDelivr. Those
            downloads are the only network traffic, and none of it carries your video, audio or words.
          </p>
          <p>No account, no watermark, no per-video cost. Your edits autosave in this browser and nowhere else.</p>
        </div>
        <div className="lp-table-wrap">
          <table className="lp-table">
            <caption>What your browser needs, and what happens without it</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Uses</th>
                <th scope="col">Without it</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([step, uses, without]) => (
                <tr key={step}>
                  <th scope="row">{step}</th>
                  <td>{uses}</td>
                  <td>{without}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="lp-note">
            Built and tested in Chrome on a Mac. Other browsers are checked feature by feature when you open the editor,
            which tells you exactly what will be slower or missing.
          </p>
        </div>
      </div>
    </section>
  );
}

const FAQ: [q: string, a: string][] = [
  [
    'What videos can I use?',
    'MP4, MOV, WebM or MKV that your browser can decode: H.264 everywhere, HEVC in Safari and in Chrome on a Mac (Windows needs Microsoft’s HEVC Video Extensions), VP9 and AV1 in current browsers. If an iPhone clip won’t open, export it from Photos as “Most Compatible”.',
  ],
  [
    'How long can a video be?',
    'It’s made for short-form: recordings up to about 20 minutes that end up a few minutes long. Longer files work, but transcription takes longer and the export is assembled in memory before you download it.',
  ],
  [
    'Which browsers work?',
    'Chrome or Edge on a recent computer is fastest, because transcription runs on the GPU through WebGPU. Without WebGPU it runs on the CPU. The editor checks your browser when it opens and lists what works.',
  ],
  ['Is it free?', 'Yes. It’s open source under the MIT license, with no account, watermark or usage limit.'],
  [
    'Does anything upload?',
    'No. The page downloads its models once; your video, transcript and edits stay on your device. Open your browser’s network panel while you work to check.',
  ],
  [
    'Can I fix the transcript?',
    'Yes. Double-click a word to fix how it’s spelled in the captions, delete words to cut them from the video, and restore anything you cut. Every edit can be undone.',
  ],
  [
    'What do I get at the end?',
    'An MP4 with H.264 video and AAC audio at 1080 × 1920, 1080 × 1080, 1080 × 1350 or 1920 × 1080, levelled to −14 LUFS, plus SRT, VTT and plain-text captions and a project file you can reopen later.',
  ],
];

function Faq() {
  return (
    <section className="lp-section lp-faq" aria-labelledby="faq-h">
      <h2 id="faq-h" className="lp-h2">
        Questions
      </h2>
      <div className="lp-faq-list">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Landing() {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!has(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (has(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) openEditorWith(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className="lp">
      <header className="lp-header">
        <a className="lp-brand" href="#/" aria-label="VibeMotion home">
          <Mark size={20} />
          <span>VibeMotion</span>
        </a>
        <nav className="lp-nav" aria-label="Site">
          <a className="btn btn-quiet" href={REPO} rel="noopener">
            GitHub
          </a>
          <a
            className="btn btn-secondary"
            href="#/edit"
            onClick={(e) => {
              e.preventDefault();
              navigate('edit');
            }}
          >
            Open the editor
          </a>
        </nav>
      </header>

      <main>
        <Hero
          onPick={() => input.current?.click()}
          onSample={() => {
            setPending({ kind: 'sample' });
            navigate('edit');
          }}
        />
        <input
          ref={input}
          type="file"
          accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => openEditorWith(e.currentTarget.files?.[0] ?? null)}
        />
        <Pipeline />
        <StyleLoops />
        <Privacy />
        <Faq />
      </main>

      <footer className="lp-footer">
        <p>
          <Mark size={14} /> VibeMotion is open source under the{' '}
          <a href={`${REPO}/blob/main/LICENSE`} rel="noopener">
            MIT license
          </a>
          . Source on{' '}
          <a href={REPO} rel="noopener">
            GitHub
          </a>
          .
        </p>
        <p>
          Built by{' '}
          <a href="https://github.com/SammyTourani" rel="noopener">
            Sammy Tourani
          </a>
          .
        </p>
      </footer>

      {dragging ? (
        <div className="drop-veil lp-drop" aria-hidden="true">
          <p>Drop to open it in the editor</p>
        </div>
      ) : null}
    </div>
  );
}
