// Where TikTok, Reels and Shorts draw their UI over a vertical video: the
// top tabs, the button column on the right, and the caption/username block
// at the bottom. An approximate union of the three apps, so anything outside
// it is safe on all of them.

import type { FrameSpec } from '../../render/compose';

export function safeZones(W: number, H: number) {
  return [
    { x: 0, y: 0, w: W, h: 0.09 * H },
    { x: 0.86 * W, y: 0.34 * H, w: 0.14 * W, h: 0.5 * H },
    { x: 0, y: 0.8 * H, w: W, h: 0.2 * H },
  ];
}

export function drawSafeZone(ctx: CanvasRenderingContext2D, spec: FrameSpec, scale: number) {
  const W = spec.outW;
  const H = spec.outH;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (spec.aspect === '9:16') {
    const zones = safeZones(W, H);
    for (const z of zones) {
      ctx.fillStyle = 'rgba(22, 23, 25, 0.42)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(z.x, z.y, z.w, z.h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(242, 242, 238, 0.22)';
      ctx.lineWidth = 3;
      for (let d = -H; d < W + H; d += 36) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + H, H);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(242, 242, 238, 0.85)';
    ctx.font = `600 ${Math.round(W * 0.03)}px "Archivo Variable", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Covered by app UI on TikTok, Reels and Shorts', W * 0.05, H * 0.8 + W * 0.07);
  }
  // Dashed outline of the safe area.
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = 'rgba(242, 242, 238, 0.7)';
  ctx.lineWidth = 3;
  if (spec.aspect === '9:16') ctx.strokeRect(0.05 * W, 0.09 * H, 0.81 * W, 0.71 * H);
  else ctx.strokeRect(0.05 * W, 0.05 * H, 0.9 * W, 0.9 * H);
  ctx.restore();
}
