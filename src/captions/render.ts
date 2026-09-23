// drawCaptions(ctx, layout, t): the one caption renderer. The editor preview,
// the MP4 export and the landing page demos all draw through here, so what
// you see is exactly what you export.

import type { Aspect, CaptionSettings } from '../project/types';
import { activeIndex, pageAt, pageWords, paginate, type CaptionPage, type CaptionWord } from './layout';
import { CAPTION_STYLES, fontString, type CaptionStyle } from './styles';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CaptionLayout {
  pages: CaptionPage[];
  style: CaptionStyle;
  settings: CaptionSettings;
  fontSize: number;
  lineHeight: number;
  capHeight: number;
  centerX: number;
  centerY: number;
  W: number;
  H: number;
}

/** Where platform UI (captions, buttons, top bar) covers a vertical video. */
export function safeArea(aspect: Aspect, W: number, H: number) {
  if (aspect === '9:16') {
    return { left: 0.14 * W, right: 0.86 * W, top: 0.12 * H, bottom: 0.78 * H };
  }
  return { left: 0.08 * W, right: 0.92 * W, top: 0.08 * H, bottom: 0.92 * H };
}

const BG_PAD: Record<CaptionStyle['animation'], number> = {
  pop: 0,
  sweep: 0,
  reveal: 0.45,
  fade: 0,
  type: 0.6,
  box: 0.18,
};

export function buildCaptionLayout(
  ctx: Ctx,
  words: readonly CaptionWord[],
  settings: CaptionSettings,
  W: number,
  H: number,
  aspect: Aspect,
): CaptionLayout {
  const style = CAPTION_STYLES[settings.style];
  // Size against the output's height, but keep landscape captions readable.
  const basis = aspect === '16:9' ? H * 1.25 : H;
  const fontSize = Math.max(10, style.baseSize * basis * settings.size);
  const lineHeight = fontSize * style.lineHeight;
  ctx.font = fontString(style, fontSize);
  setLetterSpacing(ctx, style.letterSpacing * fontSize);
  const capHeight = ctx.measureText('H').actualBoundingBoxAscent || fontSize * 0.7;
  const measure = (text: string) => ctx.measureText(text).width;

  const safe = safeArea(aspect, W, H);
  const pad = BG_PAD[style.animation] * fontSize;
  const maxWidth = Math.max(fontSize * 2, safe.right - safe.left - pad * 2);
  const upper = settings.uppercase;
  const prepared = words.map((w) => ({ ...w, text: upper ? w.text.toLocaleUpperCase() : w.text }));
  const pages = paginate(prepared, {
    maxWordsPerLine: Math.max(1, settings.wordsPerLine),
    maxLines: settings.lines,
    maxWidth,
    measure,
  });
  setLetterSpacing(ctx, 0);

  const blockH = settings.lines * lineHeight + pad;
  const minY = safe.top + blockH / 2;
  const maxY = safe.bottom - blockH / 2;
  const centerY = Math.min(Math.max(settings.position * H, minY), Math.max(minY, maxY));
  const centerX = (safe.left + safe.right) / 2;
  return { pages, style, settings, fontSize, lineHeight, capHeight, centerX, centerY, W, H };
}

function setLetterSpacing(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${px.toFixed(2)}px`;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) * (1 - x) * (1 - x);

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draws the caption page on screen at output time t (seconds). */
export function drawCaptions(ctx: Ctx, L: CaptionLayout, t: number): void {
  const page = pageAt(L.pages, t);
  if (!page) return;
  const { style, settings, fontSize, lineHeight, capHeight } = L;
  const words = pageWords(page);
  const active = activeIndex(page, t);
  const age = t - page.start;
  const nLines = page.lines.length;
  const firstCenter = L.centerY - ((nLines - 1) * lineHeight) / 2;
  const text = settings.textColor;
  const hi = settings.highlightColor;

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.font = fontString(style, fontSize);
  setLetterSpacing(ctx, style.letterSpacing * fontSize);

  // Resolve each word's position once.
  const placed = page.lines.flatMap((line, li) => {
    const cy = firstCenter + li * lineHeight;
    const x0 = L.centerX - line.width / 2;
    return line.words.map((w) => ({ w, x: x0 + w.x, cy, baseline: cy + capHeight / 2 }));
  });
  const order = (id: string) => words.findIndex((w) => w.id === id);

  const shadowOn = () => {
    if (!style.shadow) return;
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blur * fontSize;
    ctx.shadowOffsetY = style.shadow.y * fontSize;
  };
  const shadowOff = () => {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };

  // Page entrance: a short settle so pages don't just blink on.
  const enter = easeOut(clamp01(age / 0.09));

  switch (style.animation) {
    case 'pop': {
      const s0 = 0.92 + 0.08 * enter;
      for (const p of placed) {
        const i = order(p.w.id);
        const isActive = i === active;
        const cx = p.x + p.w.width / 2;
        let s = s0;
        if (isActive) {
          const k = clamp01((t - p.w.start) / 0.18);
          s *= 1.06 + 0.12 * Math.sin(k * Math.PI);
        }
        ctx.save();
        ctx.translate(cx, p.cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -p.cy);
        if (style.stroke > 0) {
          shadowOn();
          ctx.lineWidth = style.stroke * fontSize * 2;
          ctx.strokeStyle = style.strokeColor;
          ctx.strokeText(p.w.text, p.x, p.baseline);
          shadowOff();
        }
        ctx.fillStyle = isActive || p.w.emphasized ? hi : text;
        ctx.fillText(p.w.text, p.x, p.baseline);
        ctx.restore();
      }
      break;
    }
    case 'sweep': {
      ctx.globalAlpha = enter;
      shadowOn();
      ctx.lineWidth = style.stroke * fontSize * 2;
      ctx.strokeStyle = style.strokeColor;
      for (const p of placed) ctx.strokeText(p.w.text, p.x, p.baseline);
      shadowOff();
      for (const p of placed) {
        const i = order(p.w.id);
        ctx.fillStyle = p.w.emphasized ? hi : text;
        ctx.fillText(p.w.text, p.x, p.baseline);
        let fill = 0;
        if (i < active) fill = 1;
        else if (i === active) fill = clamp01((t - p.w.start) / Math.max(0.08, p.w.end - p.w.start));
        if (fill > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(p.x - fontSize * 0.1, p.cy - lineHeight, fontSize * 0.1 + p.w.width * fill, lineHeight * 2);
          ctx.clip();
          ctx.fillStyle = hi;
          ctx.fillText(p.w.text, p.x, p.baseline);
          ctx.restore();
        }
      }
      break;
    }
    case 'reveal': {
      const padX = fontSize * 0.45;
      const padY = fontSize * 0.2;
      ctx.globalAlpha = 0.6 + 0.4 * enter;
      ctx.fillStyle = 'rgba(12, 12, 14, 0.62)';
      page.lines.forEach((line, li) => {
        const cy = firstCenter + li * lineHeight;
        const x0 = L.centerX - line.width / 2;
        const h = capHeight + padY * 2 + fontSize * 0.22;
        roundRect(ctx, x0 - padX, cy - h / 2, line.width + padX * 2, h, fontSize * 0.3);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      for (const p of placed) {
        const i = order(p.w.id);
        ctx.globalAlpha = i <= active ? 1 : 0.5;
        ctx.fillStyle = i === active || p.w.emphasized ? hi : text;
        ctx.fillText(p.w.text, p.x, p.baseline);
      }
      break;
    }
    case 'fade': {
      const pageAlpha = easeOut(clamp01(age / 0.28));
      shadowOn();
      for (const p of placed) {
        const i = order(p.w.id);
        let a = 0.3;
        if (i < active) a = 1;
        else if (i === active) a = 0.3 + 0.7 * easeOut(clamp01((t - p.w.start) / 0.22));
        ctx.globalAlpha = a * pageAlpha;
        const italic = i === active || p.w.emphasized;
        ctx.font = fontString(style, fontSize, italic);
        ctx.fillStyle = italic ? hi : text;
        ctx.fillText(p.w.text, p.x, p.baseline);
      }
      shadowOff();
      break;
    }
    case 'type': {
      const pad = fontSize * 0.6;
      const widest = Math.max(...page.lines.map((l) => l.width));
      const top = firstCenter - lineHeight / 2 - pad * 0.5;
      const h = nLines * lineHeight + pad;
      ctx.fillStyle = 'rgba(10, 12, 14, 0.84)';
      roundRect(ctx, L.centerX - widest / 2 - pad, top, widest + pad * 2, h, fontSize * 0.22);
      ctx.fill();
      let caret: { x: number; cy: number } | null = null;
      for (const p of placed) {
        const i = order(p.w.id);
        if (i > active) continue;
        let shown = p.w.text;
        if (i === active) {
          const span = Math.min(0.42, Math.max(0.1, p.w.end - p.w.start));
          const k = clamp01((t - p.w.start) / span);
          shown = p.w.text.slice(0, Math.max(1, Math.ceil(p.w.text.length * k)));
          caret = { x: p.x + ctx.measureText(shown).width + fontSize * 0.08, cy: p.cy };
        }
        ctx.fillStyle = i === active || p.w.emphasized ? hi : text;
        ctx.fillText(shown, p.x, p.baseline);
      }
      if (!caret && placed.length) {
        const last = placed[placed.length - 1]!;
        if (active >= 0) caret = { x: last.x + last.w.width + fontSize * 0.08, cy: last.cy };
      }
      if (caret && Math.floor(t * 2.4) % 2 === 0) {
        ctx.fillStyle = hi;
        ctx.fillRect(caret.x, caret.cy - capHeight / 2 - fontSize * 0.06, fontSize * 0.5, capHeight + fontSize * 0.12);
      }
      break;
    }
    case 'box': {
      const padX = fontSize * 0.16;
      const padY = fontSize * 0.14;
      const rectOf = (idx: number) => {
        const p = placed.find((q) => order(q.w.id) === idx);
        if (!p) return null;
        return { x: p.x - padX, y: p.cy - capHeight / 2 - padY, w: p.w.width + padX * 2, h: capHeight + padY * 2 };
      };
      const cur = active >= 0 ? rectOf(active) : null;
      if (cur) {
        const prev = active > 0 ? rectOf(active - 1) : null;
        const k = easeOut(clamp01((t - words[active]!.start) / 0.1));
        const r = prev
          ? {
              x: prev.x + (cur.x - prev.x) * k,
              y: prev.y + (cur.y - prev.y) * k,
              w: prev.w + (cur.w - prev.w) * k,
              h: prev.h + (cur.h - prev.h) * k,
            }
          : cur;
        ctx.globalAlpha = prev ? 1 : enter;
        ctx.fillStyle = hi;
        roundRect(ctx, r.x, r.y, r.w, r.h, fontSize * 0.14);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      const onHi = luminance(hi) > 0.45 ? '#1C1D20' : '#FFFFFF';
      for (const p of placed) {
        const i = order(p.w.id);
        const isActive = i === active;
        if (!isActive) shadowOn();
        ctx.fillStyle = isActive ? onHi : p.w.emphasized ? hi : text;
        ctx.fillText(p.w.text, p.x, p.baseline);
        shadowOff();
      }
      break;
    }
  }
  ctx.restore();
}
