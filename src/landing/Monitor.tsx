import { useEffect, useRef, type ReactNode } from 'react';
import { buildCaptionLayout, type CaptionLayout } from '../captions/render';
import { settingsForStyle } from '../captions/styles';
import { loadStyleFonts } from '../captions/fonts';
import { cropAt, drawComposite } from '../render/compose';
import { capWords, edl, sampleSpec, SAMPLE_POSTER, SAMPLE_VIDEO } from './sample';

/** Output time of the hero monitor, read by the waveform strip's playhead. */
export const monitorClock = { out: 0, playing: false };

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The hero's live monitor: the sample clip, playing the edit (pauses and
 * fillers skipped), reframed to 9:16 by the tracked camera, captioned by the
 * caption engine. Nothing here is pre-rendered.
 */
export function Monitor({ caption }: { caption: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const measure = document.createElement('canvas').getContext('2d')!;
    const W = 1080;
    const H = 1920;
    const spec = sampleSpec(W, H);
    const settings = { ...settingsForStyle('punch'), position: 0.69 };
    let layout: CaptionLayout | null = null;
    let alive = true;
    let rvfc = 0;
    let raf = 0;
    let haveFrame = false;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(wrap.getBoundingClientRect().width * dpr);
      const h = Math.round((w * H) / W);
      // Compare both: a fresh canvas is 300x150, and 300 px is a real width.
      if (w > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        if (haveFrame) draw(video.currentTime);
        else paintPoster();
      }
    };
    const poster = new Image();
    poster.src = SAMPLE_POSTER;
    const paintPoster = () => {
      if (!haveFrame && poster.complete && poster.naturalWidth) ctx.drawImage(poster, 0, 0, canvas.width, canvas.height);
    };
    poster.onload = paintPoster;

    const draw = (t: number) => {
      const seg = edl.segmentAtSrc(t);
      if (seg < 0 || video.readyState < 2) return;
      drawComposite(ctx, video, spec, cropAt(spec, t, seg), layout, edl.srcToOut(t), canvas.width / W);
      haveFrame = true;
    };

    void loadStyleFonts('punch').then(() => {
      if (!alive) return;
      layout = buildCaptionLayout(measure, capWords, settings, W, H, '9:16');
    });

    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return;
      draw(meta.mediaTime);
      rvfc = video.requestVideoFrameCallback(onFrame);
    };
    rvfc = video.requestVideoFrameCallback(onFrame);

    // Play the edit: jump over every cut, and loop at the end.
    const first = edl.kept[0]!.start;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (video.paused || video.seeking) return;
      const t = video.currentTime;
      if (edl.segmentAtSrc(t + 0.03) < 0) video.currentTime = edl.resumeAfter(t + 0.03) ?? first;
      monitorClock.out = edl.srcToOut(video.currentTime);
    };
    raf = requestAnimationFrame(tick);

    const start = () => {
      if (video.currentTime < first) video.currentTime = first;
      void video.play().catch(() => undefined);
    };
    const io = new IntersectionObserver(([e]) => {
      monitorClock.playing = !!e?.isIntersecting && !reducedMotion();
      if (monitorClock.playing) start();
      else video.pause();
    });
    io.observe(wrap);
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    video.addEventListener('loadeddata', () => {
      if (video.currentTime < first) video.currentTime = first;
    });
    video.addEventListener('seeked', () => draw(video.currentTime));

    return () => {
      alive = false;
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      if (rvfc) video.cancelVideoFrameCallback(rvfc);
      video.pause();
    };
  }, []);

  return (
    <figure className="lp-monitor">
      <div className="lp-phone" ref={wrapRef}>
        <video
          ref={videoRef}
          className="lp-phone-video"
          src={SAMPLE_VIDEO}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        />
        <canvas
          ref={canvasRef}
          className="lp-phone-canvas"
          role="img"
          aria-label="The sample clip after VibeMotion's edit: pauses and filler words cut, framed vertically on the speaker, with word-by-word captions."
        />
      </div>
      <figcaption className="lp-monitor-cap">{caption}</figcaption>
    </figure>
  );
}
