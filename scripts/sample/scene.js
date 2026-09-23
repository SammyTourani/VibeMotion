// Draws one frame of the VibeMotion sample clip: a presenter talking to camera
// in a small home studio, framed off-centre in 16:9 so auto-reframe has work to
// do. Pure Canvas 2D, no assets, so the clip is fully generated locally.
//
// state: {
//   t: seconds,
//   mouth: 0..1 openness (from the narration envelope),
//   blink: 0..1 (1 = eyes closed),
//   x, y: head centre as a fraction of the frame,
//   tilt: head roll in radians,
//   look: -1..1 horizontal gaze,
// }

const SKIN = '#c98d6b';
const SKIN_SHADE = '#a86f52';
const SKIN_LIGHT = '#dcA487';
const HAIR = '#2a1d17';
const SWEATER = '#b8583a';
const SWEATER_SHADE = '#94432b';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoom(ctx, W, H, t) {
  // Wall
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#34525a');
  wall.addColorStop(1, '#263c42');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // Window, left, with late-afternoon light
  const wx = W * 0.06;
  const wy = H * 0.12;
  const ww = W * 0.24;
  const wh = H * 0.5;
  const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#f6c98a');
  sky.addColorStop(0.6, '#f0a877');
  sky.addColorStop(1, '#d9806a');
  ctx.fillStyle = '#1f3237';
  ctx.fillRect(wx - 14, wy - 14, ww + 28, wh + 28);
  ctx.fillStyle = sky;
  ctx.fillRect(wx, wy, ww, wh);
  // distant hills and a slow cloud so the window is alive
  ctx.fillStyle = '#b86a5e';
  ctx.beginPath();
  ctx.moveTo(wx, wy + wh * 0.78);
  for (let i = 0; i <= 20; i++) {
    const px = wx + (ww * i) / 20;
    const py = wy + wh * (0.74 + 0.06 * Math.sin(i * 0.9 + 1.3));
    ctx.lineTo(px, py);
  }
  ctx.lineTo(wx + ww, wy + wh);
  ctx.lineTo(wx, wy + wh);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 240, 220, 0.55)';
  const cx = wx + 60 + ((t * 7) % (ww + 160)) - 80;
  ctx.beginPath();
  ctx.ellipse(cx, wy + wh * 0.25, 70, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 40, wy + wh * 0.22, 46, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // mullions
  ctx.fillStyle = '#1f3237';
  ctx.fillRect(wx + ww / 2 - 6, wy, 12, wh);
  ctx.fillRect(wx, wy + wh / 2 - 6, ww, 12);
  // light spill on the wall
  const spill = ctx.createRadialGradient(wx + ww * 0.7, wy + wh * 0.6, 20, wx + ww * 0.7, wy + wh * 0.6, W * 0.45);
  spill.addColorStop(0, 'rgba(246, 190, 130, 0.22)');
  spill.addColorStop(1, 'rgba(246, 190, 130, 0)');
  ctx.fillStyle = spill;
  ctx.fillRect(0, 0, W, H);

  // Shelf, centre-left, with books
  const sx = W * 0.36;
  const sy = H * 0.3;
  ctx.fillStyle = '#1d2f33';
  ctx.fillRect(sx, sy + 150, W * 0.2, 16);
  ctx.fillRect(sx, sy + 330, W * 0.2, 16);
  const books = [
    ['#e0b04a', 34, 128], ['#3f7f8c', 26, 140], ['#d46a4f', 30, 118], ['#f2e3c6', 22, 134],
    ['#6d5a8c', 36, 124], ['#e0b04a', 24, 110], ['#9bb7a5', 30, 138],
  ];
  let bx = sx + 18;
  for (const [c, w, h] of books) {
    ctx.fillStyle = c;
    ctx.fillRect(bx, sy + 150 - h, w, h);
    bx += w + 5;
  }
  // a leaning book and a small pot on the lower shelf
  ctx.save();
  ctx.translate(sx + 40, sy + 330);
  ctx.rotate(-0.28);
  ctx.fillStyle = '#d46a4f';
  ctx.fillRect(0, -120, 30, 120);
  ctx.restore();
  ctx.fillStyle = '#c2703f';
  roundRect(ctx, sx + 150, sy + 262, 80, 68, 10);
  ctx.fill();
  ctx.fillStyle = '#5f8f5c';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32;
    ctx.beginPath();
    ctx.ellipse(sx + 190 + Math.cos(a) * 44, sy + 250 + Math.sin(a) * 44, 12, 34, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Floor lamp, far right
  const lx = W * 0.93;
  ctx.strokeStyle = '#1b2a2e';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(lx, H);
  ctx.lineTo(lx, H * 0.24);
  ctx.stroke();
  ctx.fillStyle = '#f3dcb0';
  ctx.beginPath();
  ctx.moveTo(lx - 90, H * 0.24);
  ctx.lineTo(lx + 90, H * 0.24);
  ctx.lineTo(lx + 60, H * 0.1);
  ctx.lineTo(lx - 60, H * 0.1);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createRadialGradient(lx, H * 0.2, 10, lx, H * 0.2, 420);
  glow.addColorStop(0, 'rgba(255, 214, 150, 0.35)');
  glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawPresenter(ctx, W, H, s) {
  const headH = H * 0.4;
  const headW = headH * 0.74;
  const hx = s.x * W;
  const hy = s.y * H;
  const tilt = s.tilt || 0;

  ctx.save();
  // Soft contact shadow on the wall
  const sh = ctx.createRadialGradient(hx + 40, hy + headH * 0.9, headW * 0.3, hx + 40, hy + headH * 0.9, headW * 2.2);
  sh.addColorStop(0, 'rgba(10, 20, 24, 0.35)');
  sh.addColorStop(1, 'rgba(10, 20, 24, 0)');
  ctx.fillStyle = sh;
  ctx.fillRect(hx - headW * 2.5, hy - headH, headW * 5, H);

  // Torso: sloped shoulders in a hoodie. It sways less than the head.
  const tx = hx - tilt * 60;
  const top = hy + headH * 0.6;
  ctx.fillStyle = SWEATER;
  ctx.beginPath();
  ctx.moveTo(tx - headW * 1.35, H + 10);
  ctx.bezierCurveTo(tx - headW * 1.34, top + headH * 0.45, tx - headW * 1.2, top + headH * 0.16, tx - headW * 0.9, top + headH * 0.1);
  ctx.bezierCurveTo(tx - headW * 0.6, top + headH * 0.04, tx - headW * 0.38, top, tx - headW * 0.3, top - 4);
  ctx.lineTo(tx + headW * 0.3, top - 4);
  ctx.bezierCurveTo(tx + headW * 0.38, top, tx + headW * 0.6, top + headH * 0.04, tx + headW * 0.9, top + headH * 0.1);
  ctx.bezierCurveTo(tx + headW * 1.2, top + headH * 0.16, tx + headW * 1.34, top + headH * 0.45, tx + headW * 1.35, H + 10);
  ctx.closePath();
  ctx.fill();
  // arm creases
  ctx.strokeStyle = SWEATER_SHADE;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(tx - headW * 0.95, top + headH * 0.3);
  ctx.quadraticCurveTo(tx - headW * 1.02, top + headH * 0.6, tx - headW * 0.98, H);
  ctx.moveTo(tx + headW * 0.95, top + headH * 0.3);
  ctx.quadraticCurveTo(tx + headW * 1.02, top + headH * 0.6, tx + headW * 0.98, H);
  ctx.stroke();
  // hood collar and drawstrings
  ctx.fillStyle = SWEATER_SHADE;
  ctx.beginPath();
  ctx.moveTo(tx - headW * 0.42, top - 2);
  ctx.quadraticCurveTo(tx, top + headH * 0.26, tx + headW * 0.42, top - 2);
  ctx.quadraticCurveTo(tx, top + headH * 0.12, tx - headW * 0.42, top - 2);
  ctx.fill();
  ctx.strokeStyle = '#f0e2cf';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(tx - headW * 0.14, top + headH * 0.12);
  ctx.lineTo(tx - headW * 0.16, top + headH * 0.42);
  ctx.moveTo(tx + headW * 0.14, top + headH * 0.12);
  ctx.lineTo(tx + headW * 0.16, top + headH * 0.4);
  ctx.stroke();

  // Neck, with the chin's shadow
  ctx.fillStyle = SKIN_SHADE;
  ctx.beginPath();
  ctx.moveTo(hx - headW * 0.19, hy + headH * 0.3);
  ctx.lineTo(hx + headW * 0.19, hy + headH * 0.3);
  ctx.lineTo(hx + headW * 0.23, top + 6);
  ctx.quadraticCurveTo(hx, top + headH * 0.07, hx - headW * 0.23, top + 6);
  ctx.closePath();
  ctx.fill();

  ctx.translate(hx, hy);
  ctx.rotate(tilt);

  // Ears
  ctx.fillStyle = SKIN_SHADE;
  ctx.beginPath();
  ctx.ellipse(-headW * 0.49, headH * 0.03, headW * 0.085, headH * 0.095, 0.1, 0, Math.PI * 2);
  ctx.ellipse(headW * 0.49, headH * 0.03, headW * 0.085, headH * 0.095, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Face
  const face = ctx.createRadialGradient(-headW * 0.14, -headH * 0.06, headW * 0.08, 0, headH * 0.02, headW * 0.72);
  face.addColorStop(0, SKIN_LIGHT);
  face.addColorStop(0.62, SKIN);
  face.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.moveTo(0, -headH * 0.5);
  ctx.bezierCurveTo(headW * 0.46, -headH * 0.5, headW * 0.52, -headH * 0.1, headW * 0.48, headH * 0.1);
  ctx.bezierCurveTo(headW * 0.44, headH * 0.32, headW * 0.2, headH * 0.5, 0, headH * 0.5);
  ctx.bezierCurveTo(-headW * 0.2, headH * 0.5, -headW * 0.44, headH * 0.32, -headW * 0.48, headH * 0.1);
  ctx.bezierCurveTo(-headW * 0.52, -headH * 0.1, -headW * 0.46, -headH * 0.5, 0, -headH * 0.5);
  ctx.closePath();
  ctx.fill();

  // Hair: a cap over the crown with a side part
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-headW * 0.5, headH * 0.0);
  ctx.bezierCurveTo(-headW * 0.62, -headH * 0.42, -headW * 0.34, -headH * 0.66, headW * 0.02, -headH * 0.64);
  ctx.bezierCurveTo(headW * 0.42, -headH * 0.64, headW * 0.64, -headH * 0.4, headW * 0.5, -headH * 0.02);
  ctx.bezierCurveTo(headW * 0.46, -headH * 0.2, headW * 0.36, -headH * 0.3, headW * 0.14, -headH * 0.32);
  ctx.bezierCurveTo(-headW * 0.02, -headH * 0.33, -headW * 0.1, -headH * 0.26, -headW * 0.2, -headH * 0.3);
  ctx.bezierCurveTo(-headW * 0.36, -headH * 0.34, -headW * 0.46, -headH * 0.2, -headW * 0.5, headH * 0.0);
  ctx.closePath();
  ctx.fill();
  // a few strands for texture
  ctx.strokeStyle = '#3d2a21';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x0 = -headW * 0.3 + i * headW * 0.13;
    ctx.moveTo(x0, -headH * 0.56);
    ctx.quadraticCurveTo(x0 + headW * 0.08, -headH * 0.46, x0 + headW * 0.04, -headH * 0.36);
  }
  ctx.stroke();

  const look = (s.look || 0) * headW * 0.03;
  const eyeY = -headH * 0.035;
  const eyeDX = headW * 0.2;
  const eyeW = headW * 0.12;
  const open = 1 - 0.95 * (s.blink || 0);
  const upper = headH * 0.05 * open;
  const lower = headH * 0.028 * open;

  // Brows: relaxed arches
  ctx.strokeStyle = HAIR;
  ctx.lineCap = 'round';
  ctx.lineWidth = headH * 0.022;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * (eyeDX - eyeW * 1.05), eyeY - headH * 0.07);
    ctx.quadraticCurveTo(side * (eyeDX - eyeW * 0.1), eyeY - headH * 0.105, side * (eyeDX + eyeW * 1.05), eyeY - headH * 0.078);
    ctx.stroke();
  }

  for (const side of [-1, 1]) {
    const ex = side * eyeDX;
    // socket shade
    ctx.fillStyle = 'rgba(110, 62, 44, 0.22)';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY - headH * 0.012, eyeW * 1.3, headH * 0.058, 0, 0, Math.PI * 2);
    ctx.fill();
    // almond eye
    const eyePath = new Path2D();
    eyePath.moveTo(ex - eyeW, eyeY);
    eyePath.bezierCurveTo(ex - eyeW * 0.5, eyeY - upper, ex + eyeW * 0.5, eyeY - upper, ex + eyeW, eyeY);
    eyePath.bezierCurveTo(ex + eyeW * 0.5, eyeY + lower, ex - eyeW * 0.5, eyeY + lower, ex - eyeW, eyeY);
    ctx.fillStyle = '#f3ede6';
    ctx.fill(eyePath);
    if (open > 0.2) {
      ctx.save();
      ctx.clip(eyePath);
      const ir = headH * 0.036;
      ctx.fillStyle = '#5a3624';
      ctx.beginPath();
      ctx.arc(ex + look, eyeY - headH * 0.004, ir, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#140c08';
      ctx.beginPath();
      ctx.arc(ex + look, eyeY - headH * 0.004, ir * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(ex + look + ir * 0.35, eyeY - ir * 0.45, ir * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // upper lid line
    ctx.strokeStyle = '#1e120d';
    ctx.lineWidth = headH * 0.011;
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 1.02, eyeY + 1);
    ctx.bezierCurveTo(ex - eyeW * 0.5, eyeY - upper, ex + eyeW * 0.5, eyeY - upper, ex + eyeW * 1.06, eyeY - 2);
    ctx.stroke();
  }

  // Nose
  ctx.strokeStyle = 'rgba(128, 74, 52, 0.5)';
  ctx.lineWidth = headH * 0.01;
  ctx.beginPath();
  ctx.moveTo(-headW * 0.03, eyeY + headH * 0.04);
  ctx.quadraticCurveTo(-headW * 0.07, headH * 0.11, -headW * 0.07, headH * 0.15);
  ctx.stroke();
  ctx.fillStyle = 'rgba(150, 90, 65, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, headH * 0.158, headW * 0.085, headH * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a3b2b';
  ctx.beginPath();
  ctx.ellipse(-headW * 0.04, headH * 0.168, headW * 0.02, headH * 0.01, 0.3, 0, Math.PI * 2);
  ctx.ellipse(headW * 0.04, headH * 0.168, headW * 0.02, headH * 0.01, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Mouth: a relaxed smile that opens with the narration envelope
  const my = headH * 0.285;
  const mw = headW * 0.16;
  const o = Math.max(0, Math.min(1, s.mouth || 0));
  const drop = headH * (0.006 + 0.06 * o);
  const mouth = new Path2D();
  mouth.moveTo(-mw, my - headH * 0.004);
  mouth.bezierCurveTo(-mw * 0.4, my - headH * 0.012, mw * 0.4, my - headH * 0.012, mw, my - headH * 0.004);
  mouth.bezierCurveTo(mw * 0.6, my + drop * 1.5 + headH * 0.01, -mw * 0.6, my + drop * 1.5 + headH * 0.01, -mw, my - headH * 0.004);
  ctx.fillStyle = o > 0.08 ? '#43191a' : '#9a4a3e';
  ctx.fill(mouth);
  if (o > 0.3) {
    ctx.save();
    ctx.clip(mouth);
    ctx.fillStyle = '#f1e8de';
    ctx.fillRect(-mw, my - headH * 0.02, mw * 2, headH * 0.02 + drop * 0.35);
    ctx.restore();
  }
  ctx.strokeStyle = '#8f4337';
  ctx.lineWidth = headH * 0.012;
  ctx.stroke(mouth);
  // corners lift into the cheeks
  ctx.strokeStyle = 'rgba(128, 70, 52, 0.5)';
  ctx.lineWidth = headH * 0.008;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * mw * 1.02, my - headH * 0.004);
    ctx.quadraticCurveTo(side * mw * 1.18, my - headH * 0.018, side * mw * 1.16, my - headH * 0.035);
    ctx.stroke();
  }

  // Cheek warmth
  ctx.fillStyle = 'rgba(214, 110, 90, 0.16)';
  ctx.beginPath();
  ctx.ellipse(-headW * 0.29, headH * 0.13, headW * 0.1, headH * 0.05, 0, 0, Math.PI * 2);
  ctx.ellipse(headW * 0.29, headH * 0.13, headW * 0.1, headH * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawScene(ctx, W, H, s) {
  drawRoom(ctx, W, H, s.t);
  drawPresenter(ctx, W, H, s);
  // Gentle vignette, like a real lens
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
