import { useEffect, useRef } from 'react';
import type { CaptionStyleId } from '../project/types';
import { settingsForStyle } from '../captions/styles';
import { loadStyleFonts } from '../captions/fonts';
import { buildCaptionLayout, drawCaptions } from '../captions/render';
import type { CaptionWord } from '../captions/layout';

const WORDS: CaptionWord[] = [
  { id: 'a', text: 'Say', start: 0, end: 0.3, emphasized: false },
  { id: 'b', text: 'it', start: 0.3, end: 0.45, emphasized: false },
  { id: 'c', text: 'like', start: 0.45, end: 0.9, emphasized: false },
  { id: 'd', text: 'this', start: 0.9, end: 1.3, emphasized: false },
];

/** A still from the real caption renderer, for the style picker. */
export function StyleSwatch({ styleId }: { styleId: CaptionStyleId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    void loadStyleFonts(styleId).then(() => {
      const c = ref.current;
      if (!live || !c) return;
      const W = 480;
      const H = 270;
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#3a4a4f');
      g.addColorStop(1, '#1f2a2d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Fit the phrase to the swatch: measure at size 1 (on one wide line),
      // then scale so it fills most of the width.
      // (Font size depends only on the height, so width scales with `size`.)
      const base = { ...settingsForStyle(styleId), position: 0.52, size: 1, lines: 1 as const, wordsPerLine: 4 };
      const probe = buildCaptionLayout(ctx, WORDS, base, W * 4, H, '16:9');
      const lineW = probe.pages[0]?.lines[0]?.width ?? W;
      const size = Math.min(4, Math.max(0.5, (0.72 * W) / lineW));
      const layout = buildCaptionLayout(ctx, WORDS, { ...base, size }, W, H, '16:9');
      drawCaptions(ctx, layout, 0.62);
    });
    return () => {
      live = false;
    };
  }, [styleId]);
  return <canvas ref={ref} className="style-canvas" aria-hidden="true" />;
}
