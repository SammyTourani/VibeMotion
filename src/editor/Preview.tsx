import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, setUi } from './store';
import { useEdl, useProject, outputSize } from './derive';
import { PreviewEngine } from './preview/engine';
import { transport } from './transport';
import { loadStyleFonts } from '../captions/fonts';
import { PauseIcon, PlayIcon, SafeZoneIcon } from '../ui/icons';
import { timecode } from '../lib/format';

function Timecode() {
  const ref = useRef<HTMLSpanElement>(null);
  const edl = useEdl();
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (ref.current) ref.current.textContent = timecode(transport.out);
    };
    paint();
    return transport.subscribe(() => {
      if (!raf) raf = requestAnimationFrame(paint);
    });
  }, []);
  return (
    <span className="tc tnum" aria-label="Output time" data-out-duration={edl?.outDuration.toFixed(4)}>
      <span ref={ref}>0:00.0</span>
      <span className="tc-total"> / {timecode(edl?.outDuration ?? 0)}</span>
    </span>
  );
}

function PlayButton() {
  const [playing, setPlaying] = useState(transport.playing);
  useEffect(() => transport.subscribe(() => setPlaying(transport.playing)), []);
  return (
    <button
      type="button"
      className="play-btn"
      aria-label={playing ? 'Pause' : 'Play'}
      title={playing ? 'Pause (Space)' : 'Play (Space)'}
      onClick={() => transport.toggle()}
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

export function Preview() {
  const url = useEditor((s) => s.url);
  const safeZone = useEditor((s) => s.ui.safeZone);
  const p = useProject();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const aspect = p?.frame.aspect ?? '9:16';
  const style = p?.captions.style;
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !url) return;
    const engine = new PreviewEngine(video, canvas);
    engineRef.current = engine;
    engine.startFrameLoop();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (!style) return;
    let live = true;
    void loadStyleFonts(style).then(() => live && engineRef.current?.invalidateLayout());
    return () => {
      live = false;
    };
  }, [style]);

  // Fit the canvas to the monitor at the output aspect.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const out = outputSize(aspect);
    const fit = () => {
      const r = box.getBoundingClientRect();
      const k = Math.min(r.width / out.w, r.height / out.h);
      setSize({ w: Math.max(1, Math.floor(out.w * k)), h: Math.max(1, Math.floor(out.h * k)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    const out = outputSize(aspect);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.min(out.w, Math.round(size.w * dpr));
    c.height = Math.round((c.width * out.h) / out.w);
    engineRef.current?.draw();
  }, [size, aspect]);

  return (
    <section className="stage" aria-label="Preview">
      <div className="monitor" ref={boxRef}>
        <div className="monitor-frame" style={{ width: size.w, height: size.h }}>
          <video ref={videoRef} src={url ?? undefined} className="monitor-video" playsInline preload="auto" aria-hidden="true" tabIndex={-1} />
          <canvas
            ref={canvasRef}
            className="monitor-canvas"
            style={{ width: size.w, height: size.h }}
            onClick={() => transport.toggle()}
            aria-label="Edited video preview. Click to play or pause."
            role="img"
          />
        </div>
      </div>
      <div className="transport">
        <PlayButton />
        <Timecode />
        <button
          type="button"
          className={`icon-btn ${safeZone ? 'is-on' : ''}`}
          aria-pressed={safeZone}
          aria-label="Show where app UI covers the video"
          title="Safe zones"
          onClick={() => setUi({ safeZone: !safeZone })}
        >
          <SafeZoneIcon />
        </button>
      </div>
    </section>
  );
}
