import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { edl, peaks, peaksPerSecond, stats, SAMPLE_SRC } from './sample';
import { Monitor, monitorClock, reducedMotion } from './Monitor';
import { timecode } from '../lib/format';

const WIDE = 125;
const TIGHT = 78;
const DURATION_MS = 1700;
const DELAY_MS = 450;

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

interface Anim {
  /** Collapse progress, 0 = source, 1 = the edit. */
  p: number;
  /** Reduced motion: crossfade amount between the two states. */
  fade: number;
  running: boolean;
}

/**
 * The waveform of the sample clip at a fixed scale. As `p` goes 0 -> 1 every
 * cut (magenta) shrinks to nothing, so the strip gets physically shorter by
 * exactly what the edit removes; a magenta tick marks each jump cut.
 */
function WaveStrip({ anim, onReplay }: { anim: RefObject<Anim>; onReplay: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const D = SAMPLE_SRC.duration;
    const H = 96;
    let W = 0;
    let raf = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.floor(wrap.getBoundingClientRect().width);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paintState = (p: number, alpha: number) => {
      // Leave room at the right for the readout at the full length.
      const scale = (W - 88) / D;
      const x = (t: number) => ((1 - p) * t + p * edl.srcToOut(t)) * scale;
      const mid = H / 2;
      const dt = 1 / peaksPerSecond;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(242, 242, 238, 0.12)';
      ctx.fillRect(0, mid, x(D), 1);
      for (let i = 0; i < peaks.length; i++) {
        const t = i * dt;
        const x0 = x(t);
        const x1 = x(t + dt);
        const w = x1 - x0;
        if (w < 0.25) continue;
        const cut = edl.segmentAtSrc(t + dt / 2) < 0;
        const h = Math.max(1, (peaks[i]! / 255) * (mid - 6));
        ctx.fillStyle = cut ? '#FF3D8B' : '#2BD4E0';
        ctx.fillRect(x0, mid - h, Math.max(0.6, w - 0.7), h * 2);
      }
      // Jump-cut marks once the gaps have closed.
      if (p > 0.85) {
        ctx.globalAlpha = alpha * Math.min(1, (p - 0.85) / 0.15);
        ctx.fillStyle = '#FF3D8B';
        for (const c of edl.cuts) {
          if (c.start <= 0.001 || c.end >= D - 0.001) continue;
          ctx.fillRect(Math.round(x(c.start)) - 1, 6, 2, H - 12);
        }
      }
      ctx.globalAlpha = 1;
      return x;
    };

    const paint = () => {
      const a = anim.current!;
      ctx.clearRect(0, 0, W, H);
      let x: (t: number) => number;
      if (reducedMotion()) {
        paintState(0, 1 - a.fade);
        x = paintState(1, a.fade);
      } else {
        x = paintState(a.p, 1);
      }
      const p = reducedMotion() ? a.fade : a.p;
      const len = (1 - p) * D + p * edl.outDuration;
      if (readoutRef.current) {
        readoutRef.current.textContent = timecode(len);
        readoutRef.current.style.transform = `translateX(${x(D) + 14}px)`;
      }
      // Playhead, in step with the monitor, once the strip shows the edit.
      if (monitorClock.playing && p > 0.999) {
        const px = Math.round(monitorClock.out * ((W - 88) / D));
        ctx.fillStyle = '#FFD426';
        ctx.fillRect(px - 1, 2, 2, H - 4);
      }
    };

    const loop = () => {
      raf = 0;
      paint();
      if (visible && (anim.current!.running || monitorClock.playing)) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    resize();
    paint();
    const ro = new ResizeObserver(() => {
      resize();
      paint();
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) kick();
    });
    io.observe(wrap);
    const timer = setInterval(kick, 250);
    return () => {
      ro.disconnect();
      io.disconnect();
      clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, [anim]);

  return (
    <div className="lp-strip">
      <div className="lp-strip-canvas" ref={wrapRef} onClick={onReplay}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <span className="lp-strip-readout tnum" ref={readoutRef} aria-hidden="true">
          {timecode(SAMPLE_SRC.duration)}
        </span>
      </div>
      <div className="lp-strip-legend">
        <p>
          The sample clip’s waveform. <span className="k-cut">Magenta</span> is what the edit removes:{' '}
          {stats.pauses} pauses and {stats.fillers} filler words, {stats.cut.toFixed(1)} seconds. What’s left is{' '}
          <span className="k-kept">cyan</span>.
        </p>
        <button type="button" className="lp-replay" onClick={onReplay}>
          Replay the cut
        </button>
      </div>
    </div>
  );
}

export function Hero({ onPick, onSample }: { onPick: () => void; onSample: () => void }) {
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const anim = useRef<Anim>({ p: 0, fade: 0, running: false });
  const frame = useRef(0);

  const setStretch = (p: number) => {
    if (h1Ref.current) h1Ref.current.style.fontStretch = `${WIDE - (WIDE - TIGHT) * p}%`;
  };

  const run = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const a = anim.current;
    const reduce = reducedMotion();
    a.running = true;
    a.p = reduce ? 1 : 0;
    a.fade = 0;
    setStretch(reduce ? 1 : 0);
    const t0 = performance.now() + (reduce ? 0 : DELAY_MS);
    const total = reduce ? 600 : DURATION_MS;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / total));
      if (reduce) a.fade = k;
      else {
        a.p = ease(k);
        setStretch(a.p);
      }
      if (k < 1) frame.current = requestAnimationFrame(step);
      else a.running = false;
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    // Wait for the real face so the headline never animates in a fallback.
    let live = true;
    setStretch(reducedMotion() ? 1 : 0);
    const fonts = document.fonts?.load('800 100px "Archivo Variable"') ?? Promise.resolve();
    void Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(() => live && run());
    return () => {
      live = false;
      cancelAnimationFrame(frame.current);
    };
  }, [run]);

  return (
    <section className="lp-hero" aria-labelledby="lp-title">
      <div className="lp-hero-text">
        <h1 id="lp-title" className="lp-h1" ref={h1Ref}>
          <span>Cut the</span> <span>dead air.</span>
        </h1>
        <p className="lp-lede">
          Drop in a raw talking-head clip and get back a captioned, tightened vertical video, rendered in your browser
          and never uploaded.
        </p>
        <div className="lp-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={onPick}>
            Drop a clip
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onSample}>
            Try the sample clip
          </button>
        </div>
        <p className="lp-trust">Runs on your GPU. Your video never uploads.</p>
      </div>
      <Monitor
        caption={
          <>
            Playing live: the sample clip, cut from <span className="tnum">{stats.source.toFixed(1)}&nbsp;s</span> to{' '}
            <span className="tnum">{stats.output.toFixed(1)}&nbsp;s</span> by the same code as the editor.
          </>
        }
      />
      <WaveStrip anim={anim} onReplay={run} />
    </section>
  );
}
