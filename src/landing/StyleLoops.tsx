import { useEffect, useRef } from 'react';
import { buildCaptionLayout, drawCaptions, type CaptionLayout } from '../captions/render';
import { CAPTION_STYLE_ORDER, CAPTION_STYLES, settingsForStyle } from '../captions/styles';
import { loadStyleFonts } from '../captions/fonts';
import type { CaptionStyleId } from '../project/types';
import { capWords, SAMPLE_POSTER } from './sample';
import { reducedMotion } from './Monitor';
import { useVisibleLoop } from './Pipeline';

// The loop: the first two sentences of the sample, in output time.
const LOOP_END = (capWords.find((w) => /^browser\.$/.test(w.text))?.end ?? 6) + 0.6;

function StyleLoop({ id, poster }: { id: CaptionStyleId; poster: HTMLImageElement }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = useRef<CaptionLayout | null>(null);

  useEffect(() => {
    let live = true;
    const measure = document.createElement('canvas').getContext('2d')!;
    void loadStyleFonts(id).then(() => {
      if (live) layout.current = buildCaptionLayout(measure, capWords, { ...settingsForStyle(id), position: 0.66 }, 1080, 1920, '9:16');
    });
    return () => {
      live = false;
    };
  }, [id]);

  useVisibleLoop(wrap, (now) => {
    const c = canvas.current;
    if (!c || !poster.complete || !poster.naturalWidth || !layout.current) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr);
    if (!W) return false;
    const Hpx = Math.round((W * 1920) / 1080);
    if (c.width !== W || c.height !== Hpx) {
      c.width = W;
      c.height = Hpx;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(poster, 0, 0, c.width, c.height);
    const t = reducedMotion() ? 1.2 : (now / 1000) % LOOP_END;
    ctx.setTransform(c.width / 1080, 0, 0, c.width / 1080, 0, 0);
    drawCaptions(ctx, layout.current, t);
    return true;
  });

  const s = CAPTION_STYLES[id];
  return (
    <li className="lp-style">
      <div className="lp-style-screen" ref={wrap}>
        <canvas ref={canvas} role="img" aria-label={`${s.name} caption style, animated`} />
      </div>
      <h3>{s.name}</h3>
      <p>{s.blurb}</p>
    </li>
  );
}

export function StyleLoops() {
  const poster = useRef<HTMLImageElement | null>(null);
  if (!poster.current && typeof Image !== 'undefined') {
    poster.current = new Image();
    poster.current.src = SAMPLE_POSTER;
  }
  return (
    <section className="lp-section" aria-labelledby="styles-h">
      <div className="lp-section-head">
        <h2 id="styles-h" className="lp-h2">
          Caption styles
        </h2>
        <p className="lp-section-lede">
          Drawn live by the renderer your export uses, on the sample’s words. Each style brings its own typeface; size,
          position, colours and emphasized words are yours to change.
        </p>
      </div>
      <ul className="lp-styles">
        {CAPTION_STYLE_ORDER.map((id) => (
          <StyleLoop key={id} id={id} poster={poster.current!} />
        ))}
      </ul>
    </section>
  );
}
