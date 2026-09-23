import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Preload the Archivo (latin, variable width) font so the hero headline never
 * swaps faces mid-animation. Vite hashes the file name at build time, so the
 * tag is injected after bundling rather than written into index.html.
 */
function preloadUiFont(): Plugin {
  return {
    name: 'vibemotion:preload-ui-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const asset = Object.keys(ctx.bundle ?? {}).find((f) =>
          /archivo-latin-wdth-normal.*\.woff2$/.test(f),
        );
        if (!asset) return [];
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
              href: `${ctx.server ? '/' : '/VibeMotion/'}${asset}`,
            },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

/**
 * transformers.js points ONNX Runtime at jsDelivr for its WebAssembly (5.5 MB
 * brotli, cached immutably), but Vite still copies the 27 MB fallback file
 * that onnxruntime-web references. It is never fetched; keep it out of dist.
 */
function dropUnusedOrtWasm(): Plugin {
  return {
    name: 'vibemotion:drop-unused-ort-wasm',
    apply: 'build',
    generateBundle(_opts, bundle) {
      for (const key of Object.keys(bundle)) {
        if (/ort-wasm[^/]*\.wasm$/.test(key)) delete bundle[key];
      }
    },
  };
}

export default defineConfig({
  base: '/VibeMotion/',
  plugins: [react(), preloadUiFont(), dropUnusedOrtWasm()],
  worker: { format: 'es', plugins: () => [dropUnusedOrtWasm()] },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4096,
  },
  server: { port: 5311, strictPort: true },
  preview: { port: 5312, strictPort: true },
});
