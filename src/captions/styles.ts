import type { CaptionSettings, CaptionStyleId } from '../project/types';

export type FontKey = 'anton' | 'nunito' | 'tiktok' | 'instrument' | 'instrument-italic' | 'jetbrains' | 'archivo';

export interface CaptionStyle {
  id: CaptionStyleId;
  name: string;
  /** One line for the style picker. */
  blurb: string;
  family: string;
  weight: number;
  fonts: FontKey[];
  /** Font size as a fraction of the output height, at size 1. */
  baseSize: number;
  lineHeight: number;
  /** em */
  letterSpacing: number;
  uppercase: boolean;
  wordsPerLine: number;
  lines: 1 | 2;
  textColor: string;
  highlightColor: string;
  /** Outline under the fill, in em. */
  stroke: number;
  strokeColor: string;
  shadow: { color: string; blur: number; y: number } | null;
  animation: 'pop' | 'sweep' | 'reveal' | 'fade' | 'type' | 'box';
}

export const CAPTION_STYLES: Record<CaptionStyleId, CaptionStyle> = {
  punch: {
    id: 'punch',
    name: 'Punch',
    blurb: 'Heavy condensed caps with a thick outline. The spoken word pops.',
    family: 'VM Anton',
    weight: 400,
    fonts: ['anton'],
    baseSize: 0.058,
    lineHeight: 1.08,
    letterSpacing: 0.01,
    uppercase: true,
    wordsPerLine: 3,
    lines: 1,
    textColor: '#FFFFFF',
    highlightColor: '#FFD426',
    stroke: 0.16,
    strokeColor: '#101010',
    shadow: { color: 'rgba(0,0,0,0.45)', blur: 0.12, y: 0.06 },
    animation: 'pop',
  },
  karaoke: {
    id: 'karaoke',
    name: 'Karaoke',
    blurb: 'Rounded heavy sans. Colour sweeps across each word as it is said.',
    family: 'VM Nunito',
    weight: 900,
    fonts: ['nunito'],
    baseSize: 0.046,
    lineHeight: 1.18,
    letterSpacing: 0,
    uppercase: false,
    wordsPerLine: 4,
    lines: 2,
    textColor: '#FFFFFF',
    highlightColor: '#2BD4E0',
    stroke: 0.13,
    strokeColor: '#141414',
    shadow: { color: 'rgba(0,0,0,0.4)', blur: 0.1, y: 0.05 },
    animation: 'sweep',
  },
  clean: {
    id: 'clean',
    name: 'Clean',
    blurb: 'Sentence case on a soft pill, like platform auto-captions.',
    family: 'VM TikTok Sans',
    weight: 600,
    fonts: ['tiktok'],
    baseSize: 0.033,
    lineHeight: 1.5,
    letterSpacing: 0,
    uppercase: false,
    wordsPerLine: 6,
    lines: 2,
    textColor: '#FFFFFF',
    highlightColor: '#FFFFFF',
    stroke: 0,
    strokeColor: '#000000',
    shadow: null,
    animation: 'reveal',
  },
  story: {
    id: 'story',
    name: 'Story',
    blurb: 'An elegant serif that fades in word by word. For vlogs.',
    family: 'VM Instrument Serif',
    weight: 400,
    fonts: ['instrument', 'instrument-italic'],
    baseSize: 0.05,
    lineHeight: 1.14,
    letterSpacing: 0,
    uppercase: false,
    wordsPerLine: 5,
    lines: 2,
    textColor: '#FFFFFF',
    highlightColor: '#FFE7A3',
    stroke: 0,
    strokeColor: '#000000',
    shadow: { color: 'rgba(0,0,0,0.55)', blur: 0.2, y: 0.03 },
    animation: 'fade',
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    blurb: 'Monospace, typed out as you speak. For dev and tech videos.',
    family: 'VM JetBrains Mono',
    weight: 600,
    fonts: ['jetbrains'],
    baseSize: 0.032,
    lineHeight: 1.45,
    letterSpacing: 0,
    uppercase: false,
    wordsPerLine: 5,
    lines: 2,
    textColor: '#E6EDF3',
    highlightColor: '#7EE787',
    stroke: 0,
    strokeColor: '#000000',
    shadow: null,
    animation: 'type',
  },
  box: {
    id: 'box',
    name: 'Box',
    blurb: 'Bold sans. A colour block slides under the spoken word.',
    family: 'VM Archivo',
    weight: 800,
    fonts: ['archivo'],
    baseSize: 0.046,
    lineHeight: 1.3,
    letterSpacing: -0.005,
    uppercase: true,
    wordsPerLine: 3,
    lines: 2,
    textColor: '#FFFFFF',
    highlightColor: '#FFD426',
    stroke: 0,
    strokeColor: '#000000',
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 0.14, y: 0.04 },
    animation: 'box',
  },
};

export const CAPTION_STYLE_ORDER: CaptionStyleId[] = ['punch', 'karaoke', 'box', 'clean', 'story', 'terminal'];

/** Settings a user gets when they pick a style: the style's own defaults. */
export function settingsForStyle(id: CaptionStyleId, prev?: CaptionSettings): CaptionSettings {
  const s = CAPTION_STYLES[id];
  return {
    enabled: prev?.enabled ?? true,
    style: id,
    size: prev?.size ?? 1,
    position: prev?.position ?? 0.7,
    wordsPerLine: s.wordsPerLine,
    lines: s.lines,
    uppercase: s.uppercase,
    textColor: s.textColor,
    highlightColor: s.highlightColor,
    emphasized: prev?.emphasized ?? [],
  };
}

export function fontString(style: CaptionStyle, px: number, italic = false): string {
  return `${italic ? 'italic ' : ''}${style.weight} ${px.toFixed(1)}px "${style.family}"`;
}
