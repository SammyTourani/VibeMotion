import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { buildCaptionLayout, drawCaptions, type CaptionLayout } from '../captions/render';
import { settingsForStyle } from '../captions/styles';
import { loadStyleFonts } from '../captions/fonts';
import { cropRect } from '../reframe/crop';
import { cameraAt, targetAt } from '../reframe/track';
import { capWords, camera, edl, facePath, words, SAMPLE_POSTER, SAMPLE_SRC, SAMPLE_VIDEO, SAMPLE_WIDE } from './sample';
import { reducedMotion } from './Monitor';
import { timecode } from '../lib/format';

/**
 * Draws a first frame as soon as its inputs (images, fonts, video) are ready,
 * visible or not, then runs `frame` on every animation frame while the
 * element is on screen. `frame` returns false when it couldn't draw yet.
 */
export function useVisibleLoop(ref: RefObject<HTMLElement | null>, frame: (now: number) => boolean | void) {
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let on = false;
    let tries = 0;
    const first = setInterval(() => {
      if (on || frameRef.current(performance.now()) !== false || ++tries > 40) clearInterval(first);
    }, 150);
    const loop = (now: number) => {
      frameRef.current(now);
      if (on) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      const vis = !!e?.isIntersecting;
      if (vis && !on) {
        on = true;
        raf = requestAnimationFrame(loop);
      } else if (!vis) {
        on = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(el);
    return () => {
      on = false;
      clearInterval(first);
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}

function TranscribeViz() {
  const start = words.findIndex((w) => w.text === 'It');
  const shown = words.slice(start, start + 5);
  return (
    <div className="viz viz-words" aria-label="Words with the times Whisper gave them">
      {shown.map((w) => (
        <span key={w.id} className="viz-word">
          <span>{w.text}</span>
          <span className="tnum">{timecode(w.start)}</span>
        </span>
      ))}
    </div>
  );
}

function TightenViz() {
  // One sentence: "It finds the long pauses, uh, and the filler words, and it cuts them out."
  const start = words.findIndex((w) => w.text === 'It');
  let end = start;
  while (end < words.length - 1 && !/[.?!]$/.test(words[end]!.text)) end++;
  const shown = words.slice(start, end + 1);
  const pauseAfter = shown[shown.length - 1]!;
  const next = words[words.indexOf(pauseAfter) + 1];
  let cut = 0;
  if (next) {
    for (const c of edl.cuts) cut += Math.max(0, Math.min(c.end, next.start) - Math.max(c.start, pauseAfter.end));
  }
  return (
    <p className="viz viz-tighten">
      {shown.map((w) => {
        const i = words.indexOf(w);
        const st = edl.wordStatus[i];
        return (
          <span key={w.id}>
            <span className={st === 'kept' ? '' : 'viz-cut'}>{w.text}</span>{' '}
          </span>
        );
      })}
      {cut > 0.2 ? <span className="viz-pause tnum">−{cut.toFixed(1)}s</span> : null}
    </p>
  );
}

function ReframeViz() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current!;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !reducedMotion()) void v.play().catch(() => undefined);
      else v.pause();
    });
    io.observe(wrap.current!);
    return () => io.disconnect();
  }, []);
  const still = useRef<HTMLImageElement | null>(null);
  if (!still.current && typeof Image !== 'undefined') {
    still.current = new Image();
    still.current.src = SAMPLE_WIDE;
  }
  useVisibleLoop(wrap, () => {
    const c = canvas.current;
    const v = video.current;
    const img = still.current;
    if (!c || !v || !img) return false;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return false;
    const live = v.readyState >= 2 && v.currentTime > 0;
    if (!live && !(img.complete && img.naturalWidth)) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The still is the frame at 2.0 s; draw the crop where the camera was then.
    const t = live ? v.currentTime : 2.0;
    ctx.drawImage(live ? v : img, 0, 0, W, H);
    const cam = cameraAt(camera, t);
    const r = cropRect(SAMPLE_SRC.width, SAMPLE_SRC.height, '9:16', cam.x, cam.y);
    const k = W / SAMPLE_SRC.width;
    // Everything outside the crop is what vertical viewers never see.
    ctx.fillStyle = 'rgba(22, 23, 25, 0.62)';
    ctx.fillRect(0, 0, r.x * k, H);
    ctx.fillRect((r.x + r.w) * k, 0, W - (r.x + r.w) * k, H);
    ctx.strokeStyle = '#2BD4E0';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x * k + 1, 1, r.w * k - 2, H - 2);
    const f = targetAt(facePath, t);
    ctx.strokeStyle = 'rgba(242, 242, 238, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect((f.x - f.w / 2) * W, (f.y - f.h / 2) * H, f.w * W, f.h * H);
    ctx.setLineDash([]);
    return true;
  });
  return (
    <div className="viz viz-frame" ref={wrap}>
      <video ref={video} src={SAMPLE_VIDEO} muted playsInline loop preload="metadata" aria-hidden="true" tabIndex={-1} />
      <canvas
        ref={canvas}
        role="img"
        aria-label="The original wide frame, with the vertical crop window following the speaker's face"
      />
    </div>
  );
}

function CaptionViz() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = useRef<CaptionLayout | null>(null);
  const poster = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = SAMPLE_POSTER;
    poster.current = img;
    const measure = document.createElement('canvas').getContext('2d')!;
    void loadStyleFonts('box').then(() => {
      layout.current = buildCaptionLayout(measure, capWords, { ...settingsForStyle('box'), position: 0.62 }, 1080, 1920, '9:16');
    });
  }, []);
  // "And adds these captions." — anchored on "adds" (there are other "and"s).
  const adds = capWords.findIndex((w) => /^adds$/i.test(w.text));
  const from = capWords[Math.max(0, adds - 1)]?.start ?? 0;
  const to = (capWords[Math.min(capWords.length - 1, adds + 2)]?.end ?? from + 2) + 0.5;
  useVisibleLoop(wrap, (now) => {
    const c = canvas.current;
    const img = poster.current;
    if (!c || !img?.complete || !img.naturalWidth || !layout.current) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    if (!W) return false;
    const cw = Math.round(W * dpr);
    const ch = Math.round(cw * (1920 / 1080));
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const t = reducedMotion() ? from + 0.9 : from + ((now / 1000) % (to - from));
    ctx.setTransform(c.width / 1080, 0, 0, c.width / 1080, 0, 0);
    drawCaptions(ctx, layout.current, t);
    return true;
  });
  return (
    <div className="viz viz-caption" ref={wrap}>
      <canvas ref={canvas} role="img" aria-label="Captions drawn word by word in the Box style" />
    </div>
  );
}

function ExportViz() {
  return (
    <dl className="viz viz-spec">
      <div>
        <dt>Video</dt>
        <dd className="tnum">H.264, 1080 × 1920</dd>
      </div>
      <div>
        <dt>Audio</dt>
        <dd className="tnum">AAC at −14 LUFS</dd>
      </div>
      <div>
        <dt>Captions</dt>
        <dd>SRT, VTT, TXT</dd>
      </div>
    </dl>
  );
}

const STEPS: { title: string; text: string; viz: () => ReactNode }[] = [
  {
    title: 'Transcribe',
    text: 'Whisper runs on your GPU and times every word, in the language you speak.',
    viz: () => <TranscribeViz />,
  },
  {
    title: 'Tighten',
    text: 'Pauses and filler words are cut. Delete any word in the transcript to cut it from the video.',
    viz: () => <TightenViz />,
  },
  {
    title: 'Reframe',
    text: 'A face tracker steers a vertical crop like a camera operator: steady on small moves, smooth on big ones.',
    viz: () => <ReframeViz />,
  },
  {
    title: 'Caption',
    text: 'Word-by-word captions in six styles, placed clear of the app buttons.',
    viz: () => <CaptionViz />,
  },
  {
    title: 'Export',
    text: 'An MP4 made on your machine, levelled to the loudness platforms play at.',
    viz: () => <ExportViz />,
  },
];

export function Pipeline() {
  return (
    <section className="lp-section" aria-labelledby="how-h">
      <h2 id="how-h" className="lp-h2">
        How it works
      </h2>
      <ol className="lp-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="lp-step">
            <div className="lp-step-head">
              <span className="lp-step-n tnum" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.title}</h3>
            </div>
            <p>{s.text}</p>
            <div className="lp-step-viz">{s.viz()}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
