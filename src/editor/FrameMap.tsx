import { useEffect, useRef } from 'react';
import { useProject } from './derive';
import { setFrame } from './actions';
import { baseCrop } from '../reframe/crop';
import { transport } from './transport';

/** Manual framing: the whole source frame, with the crop window you can drag. */
export function FrameMap() {
  const p = useProject()!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 300;
  const H = Math.round((W * p.source.height) / p.source.width);
  const base = baseCrop(p.source.width, p.source.height, p.frame.aspect);
  const cw = (base.w / p.source.width) * W;
  const ch = (base.h / p.source.height) * H;
  const x = Math.min(Math.max(p.frame.manualX * W - cw / 2, 0), W - cw);
  const y = Math.min(Math.max(p.frame.manualY * H - ch / 2, 0), H - ch);

  useEffect(() => {
    const c = canvasRef.current;
    const video = document.querySelector<HTMLVideoElement>('.monitor-video');
    if (!c || !video) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    const paint = () => {
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, c.width, c.height);
    };
    paint();
    let raf = 0;
    const unsub = transport.subscribe(() => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
      });
    });
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, [W, H]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      setFrame(
        {
          manualX: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
          manualY: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
        },
        'framemap',
      );
    };
    move(e.nativeEvent);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div className="framemap" style={{ width: W, height: H }} onPointerDown={onPointerDown} role="presentation">
      <canvas ref={canvasRef} style={{ width: W, height: H }} aria-hidden="true" />
      <div className="framemap-crop" style={{ left: x, top: y, width: cw, height: ch }} aria-hidden="true" />
      <span className="visually-hidden">Drag to place the crop. You can also use the sliders below.</span>
    </div>
  );
}
