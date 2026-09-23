// Caption fonts are registered through the FontFace API on first use, latin
// subset only, so a style's face costs nothing until someone picks it. The
// canvas renderer awaits these before drawing; a canvas never falls back to
// a system font mid-render.

import antonUrl from '@fontsource/anton/files/anton-latin-400-normal.woff2?url';
import nunitoUrl from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import tiktokUrl from '@fontsource-variable/tiktok-sans/files/tiktok-sans-latin-wght-normal.woff2?url';
import instrumentUrl from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url';
import instrumentItalicUrl from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url';
import jetbrainsUrl from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import archivoUrl from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url';
import type { CaptionStyleId } from '../project/types';
import { CAPTION_STYLES, type FontKey } from './styles';

const FACES: Record<FontKey, { family: string; url: string; descriptors: FontFaceDescriptors }> = {
  anton: { family: 'VM Anton', url: antonUrl, descriptors: { weight: '400' } },
  nunito: { family: 'VM Nunito', url: nunitoUrl, descriptors: { weight: '200 1000' } },
  tiktok: { family: 'VM TikTok Sans', url: tiktokUrl, descriptors: { weight: '300 900' } },
  instrument: { family: 'VM Instrument Serif', url: instrumentUrl, descriptors: { weight: '400' } },
  'instrument-italic': {
    family: 'VM Instrument Serif',
    url: instrumentItalicUrl,
    descriptors: { weight: '400', style: 'italic' },
  },
  jetbrains: { family: 'VM JetBrains Mono', url: jetbrainsUrl, descriptors: { weight: '100 800' } },
  archivo: { family: 'VM Archivo', url: archivoUrl, descriptors: { weight: '100 900', stretch: '62% 125%' } },
};

const loading = new Map<FontKey, Promise<void>>();

export function loadFont(key: FontKey): Promise<void> {
  let p = loading.get(key);
  if (!p) {
    const face = FACES[key];
    const ff = new FontFace(face.family, `url(${face.url}) format("woff2")`, face.descriptors);
    p = ff.load().then((loaded) => {
      document.fonts.add(loaded);
    });
    p.catch(() => loading.delete(key));
    loading.set(key, p);
  }
  return p;
}

export function loadStyleFonts(id: CaptionStyleId): Promise<void> {
  return Promise.all(CAPTION_STYLES[id].fonts.map(loadFont)).then(() => undefined);
}

export function allStyleFonts(): Promise<void> {
  return Promise.all((Object.keys(FACES) as FontKey[]).map(loadFont)).then(() => undefined);
}
