import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from './store';
import { derivePauses, useEdl, useProject } from './derive';
import { cutRange, restoreRange } from './actions';
import { transport } from './transport';
import { timecode } from '../lib/format';
import { ZoomInIcon, ZoomOutIcon } from '../ui/icons';

const H = 136;
const RULER = 20;
const WAVE_TOP = 26;
const WAVE_H = 70;
const WORD_TOP = 102;
const WORD_H = 28;

const C = {
  bg: '#26282c',
  lane: '#1f2023',
  hairline: '#36383d',
  text: '#9c9d9b',
  paper: '#f2f2ee',
  kept: '#2bd4e0',
  cut: '#ff3d8b',
  now: '#ffd426',
};

function niceStep(secPerPx: number): number {
  const target = secPerPx * 90;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= target) ?? 1200;
}

export function Timeline() {
  const p = useProject();
  const edl = useEdl();
  const analysis = useEditor((s) => s.analysis);
  const rangeSel = useEditor((s) => s.rangeSel);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(800);
  const duration = p?.source.duration ?? 1;
  // Visible window, in source seconds.
  const [view, setView] = useState({ start: 0, span: duration });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);

  useEffect(() => setView({ start: 0, span: duration }), [duration]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, Math.floor(el.getBoundingClientRect().width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tToX = useCallback((t: number) => ((t - viewRef.current.start) / viewRef.current.span) * width, [width]);
  const xToT = useCallback((x: number) => viewRef.current.start + (x / width) * viewRef.current.span, [width]);

  // Static layer: ruler, waveform, kept/cut regions, words. Redrawn on edits and zoom.
  useEffect(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const off = staticRef.current ?? document.createElement('canvas');
    staticRef.current = off;
    off.width = Math.round(width * dpr);
    off.height = Math.round(H * dpr);
    const ctx = off.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, width, H);
    ctx.fillStyle = C.lane;
    ctx.fillRect(0, WAVE_TOP, width, WAVE_H);
    const { start, span } = view;
    const secPerPx = span / width;
    const x = (t: number) => ((t - start) / span) * width;

    // Ruler
    const step = niceStep(secPerPx);
    ctx.font = '500 11px "Archivo Variable", sans-serif';
    ctx.fillStyle = C.text;
    ctx.strokeStyle = C.hairline;
    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle';
    for (let t = Math.floor(start / step) * step; t <= start + span; t += step) {
      const px = Math.round(x(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, RULER - 6);
      ctx.lineTo(px, RULER);
      ctx.stroke();
      ctx.fillText(timecode(t, step < 1), px + 4, RULER / 2);
    }

    if (edl) {
      // Cut regions: magenta band with a hatch.
      for (const c of edl.cuts) {
        const a = x(c.start);
        const b = x(c.end);
        if (b < 0 || a > width) continue;
        ctx.fillStyle = 'rgba(255, 61, 139, 0.13)';
        ctx.fillRect(a, WAVE_TOP, Math.max(1, b - a), WAVE_H + WORD_H + 6);
        ctx.save();
        ctx.beginPath();
        ctx.rect(a, WAVE_TOP, Math.max(1, b - a), WAVE_H);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255, 61, 139, 0.22)';
        for (let d = a - WAVE_H; d < b; d += 7) {
          ctx.beginPath();
          ctx.moveTo(d, WAVE_TOP + WAVE_H);
          ctx.lineTo(d + WAVE_H, WAVE_TOP);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Waveform
    if (analysis) {
      const peaks = analysis.peaks;
      const mid = WAVE_TOP + WAVE_H / 2;
      const amp = WAVE_H / 2 - 3;
      const cuts = edl?.cuts ?? [];
      let ci = 0;
      for (let px = 0; px < width; px++) {
        const t0 = start + px * secPerPx;
        const t1 = t0 + secPerPx;
        const a = Math.max(0, Math.floor(t0 * 100));
        const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil(t1 * 100)));
        let m = 0;
        for (let i = a; i < b; i++) if (peaks[i]! > m) m = peaks[i]!;
        // perceptual scale so quiet speech is still visible
        const v = Math.min(1, Math.sqrt(m) * 1.25);
        const tc = (t0 + t1) / 2;
        while (ci < cuts.length && cuts[ci]!.end <= tc) ci++;
        const inCut = ci < cuts.length && cuts[ci]!.start <= tc;
        ctx.fillStyle = inCut ? 'rgba(255, 61, 139, 0.75)' : C.kept;
        const h = Math.max(1, v * amp);
        ctx.fillRect(px, mid - h, 1, h * 2);
      }
    }

    // Pause markers under the waveform (VAD), then words.
    if (p && analysis) {
      ctx.fillStyle = 'rgba(242, 242, 238, 0.07)';
      for (const s of derivePauses(p, analysis)) {
        const a = x(s.start);
        const b = x(s.end);
        if (b < 0 || a > width) continue;
        ctx.fillRect(a, WAVE_TOP + WAVE_H - 3, b - a, 3);
      }
    }
    const words = p?.transcript?.words ?? [];
    const pxPerSec = 1 / secPerPx;
    ctx.font = '500 11px "Archivo Variable", sans-serif';
    ctx.textBaseline = 'middle';
    let lastLabelEnd = -Infinity;
    words.forEach((w, i) => {
      const a = x(w.start);
      if (a > width || x(w.end) < 0) return;
      const st = edl?.wordStatus[i] ?? 'kept';
      const cut = st !== 'kept';
      ctx.fillStyle = cut ? C.cut : 'rgba(242, 242, 238, 0.55)';
      ctx.fillRect(Math.round(a), WORD_TOP, 1, pxPerSec > 40 ? 6 : WORD_H - 8);
      if (pxPerSec > 40) {
        const label = p!.textFixes[w.id] ?? w.text;
        const tw = ctx.measureText(label).width;
        if (a + 3 > lastLabelEnd) {
          ctx.fillStyle = cut ? C.cut : C.text;
          ctx.fillText(label, a + 3, WORD_TOP + 16);
          if (cut) ctx.fillRect(a + 3, WORD_TOP + 16, tw, 1);
          lastLabelEnd = a + 3 + tw + 6;
        }
      }
    });
  }, [width, view, edl, analysis, p]);

  // Composite static layer + playhead + selection, every transport tick.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const paint = () => {
      raf = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (staticRef.current) ctx.drawImage(staticRef.current, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sel = useEditor.getState().rangeSel;
      if (sel) {
        const a = tToX(sel.start);
        const b = tToX(sel.end);
        ctx.fillStyle = 'rgba(242, 242, 238, 0.14)';
        ctx.fillRect(a, RULER, b - a, H - RULER);
        ctx.fillStyle = C.paper;
        ctx.fillRect(Math.round(a), RULER, 1.5, H - RULER);
        ctx.fillRect(Math.round(b), RULER, 1.5, H - RULER);
      }
      const px = Math.round(tToX(transport.src));
      if (px >= -2 && px <= width + 2) {
        ctx.fillStyle = C.now;
        ctx.fillRect(px - 1, RULER - 2, 2, H - RULER + 2);
        ctx.beginPath();
        ctx.moveTo(px - 6, 2);
        ctx.lineTo(px + 6, 2);
        ctx.lineTo(px + 6, 10);
        ctx.lineTo(px, 16);
        ctx.lineTo(px - 6, 10);
        ctx.closePath();
        ctx.fill();
      }
      // Keep the playhead in view while playing.
      if (transport.playing) {
        const v = viewRef.current;
        if (transport.src > v.start + v.span * 0.95 || transport.src < v.start) {
          const nextStart = Math.max(0, Math.min(duration - v.span, transport.src - v.span * 0.05));
          if (Math.abs(nextStart - v.start) > 1e-3) setView({ start: nextStart, span: v.span });
        }
      }
    };
    paint();
    const unsub = transport.subscribe(() => {
      if (!raf) raf = requestAnimationFrame(paint);
    });
    const unsub2 = useEditor.subscribe((s, prev) => {
      if (s.rangeSel !== prev.rangeSel && !raf) raf = requestAnimationFrame(paint);
    });
    return () => {
      unsub();
      unsub2();
      cancelAnimationFrame(raf);
    };
  }, [width, view, edl, analysis, p, tToX, duration]);

  const clampView = (start: number, span: number) => {
    const s = Math.min(duration, Math.max(Math.min(duration, 0.5), span));
    return { start: Math.max(0, Math.min(duration - s, start)), span: s };
  };

  const zoomBy = (factor: number, anchorT?: number) => {
    const v = viewRef.current;
    const anchor = anchorT ?? (transport.src >= v.start && transport.src <= v.start + v.span ? transport.src : v.start + v.span / 2);
    const span = v.span * factor;
    const k = (anchor - v.start) / v.span;
    setView(clampView(anchor - k * span, span));
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasRef.current!.getBoundingClientRect();
      zoomBy(Math.exp(e.deltaY * 0.01), xToT(e.clientX - rect.left));
      return;
    }
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx) return;
    const v = viewRef.current;
    setView(clampView(v.start + (dx / width) * v.span, v.span));
  };

  // Browsers make wheel listeners passive by default; ctrl-zoom needs preventDefault.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const block = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) e.preventDefault();
    };
    c.addEventListener('wheel', block, { passive: false });
    return () => c.removeEventListener('wheel', block);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x0: x, t0: xToT(x), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (Math.abs(x - d.x0) > 3) d.moved = true;
    if (d.moved) {
      const t = Math.max(0, Math.min(duration, xToT(x)));
      useEditor.setState({ rangeSel: { start: Math.min(d.t0, t), end: Math.max(d.t0, t) }, selection: null });
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      useEditor.setState({ rangeSel: null });
      transport.seekSrc(Math.max(0, Math.min(duration, d.t0)));
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const zoomed = view.span < duration - 1e-6;
  const selLeft = rangeSel ? Math.max(0, Math.min(width - 180, tToX((rangeSel.start + rangeSel.end) / 2) - 90)) : 0;

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-tools">
        <span className="legend">
          <i className="sw sw-kept" aria-hidden="true" /> Kept
          <i className="sw sw-cut" aria-hidden="true" /> Cut
        </span>
        <span className="timeline-hint">Click to jump. Drag across the waveform to cut or restore a stretch.</span>
        <div className="timeline-zoom">
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(1.6)} disabled={!zoomed}>
            <ZoomOutIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1 / 1.6)} disabled={view.span <= 0.6}>
            <ZoomInIcon />
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setView({ start: 0, span: duration })} disabled={!zoomed}>
            Fit
          </button>
        </div>
      </div>
      <div className="timeline-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width, height: H }}
          className="timeline-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          role="img"
          aria-label="Waveform. Cyan is kept, magenta is cut."
        />
        {rangeSel && rangeSel.end - rangeSel.start > 0.02 ? (
          <div className="range-actions" style={{ left: selLeft }} role="toolbar" aria-label="Selected stretch">
            <span className="tnum">{(rangeSel.end - rangeSel.start).toFixed(1)} s</span>
            <button
              type="button"
              className="btn btn-sm btn-cut"
              onClick={() => {
                cutRange(rangeSel.start, rangeSel.end);
                useEditor.setState({ rangeSel: null });
              }}
            >
              Cut
            </button>
            <button
              type="button"
              className="btn btn-sm btn-keep"
              onClick={() => {
                restoreRange(rangeSel.start, rangeSel.end);
                useEditor.setState({ rangeSel: null });
              }}
            >
              Restore
            </button>
          </div>
        ) : null}
      </div>
      {zoomed ? (
        <div
          className="scrollbar"
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const startX = e.clientX;
            const v0 = viewRef.current;
            const thumbL = (v0.start / duration) * rect.width;
            const thumbW = (v0.span / duration) * rect.width;
            const onThumb = e.clientX - rect.left >= thumbL && e.clientX - rect.left <= thumbL + thumbW;
            if (!onThumb) setView(clampView(((e.clientX - rect.left) / rect.width) * duration - v0.span / 2, v0.span));
            const base = onThumb ? v0.start : viewRef.current.start;
            const move = (ev: PointerEvent) => setView(clampView(base + ((ev.clientX - startX) / rect.width) * duration, v0.span));
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        >
          <div className="scrollbar-thumb" style={{ left: `${(view.start / duration) * 100}%`, width: `${(view.span / duration) * 100}%` }} />
        </div>
      ) : null}
    </section>
  );
}
