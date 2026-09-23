// What this browser can do, feature-detected rather than guessed from the
// user agent. The editor reports this plainly and routes around gaps
// (WebAssembly transcription, a WASM AAC encoder).

import type { AsrBackend } from '../asr/models';

export interface Capabilities {
  webgpu: boolean;
  shaderF16: boolean;
  webcodecs: boolean;
  videoEncoder: boolean;
  audioEncoder: boolean;
  avc: boolean;
  aacNative: boolean;
  offscreenCanvas: boolean;
  indexedDb: boolean;
}

export async function detectCapabilities(): Promise<Capabilities> {
  let webgpu = false;
  let shaderF16 = false;
  try {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    if (adapter) {
      webgpu = true;
      shaderF16 = adapter.features.has('shader-f16');
    }
  } catch {
    webgpu = false;
  }
  const videoEncoder = typeof VideoEncoder !== 'undefined';
  const audioEncoder = typeof AudioEncoder !== 'undefined';
  const webcodecs = videoEncoder && typeof VideoDecoder !== 'undefined';
  let avc = false;
  let aacNative = false;
  if (videoEncoder) {
    try {
      avc = !!(
        await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1080, height: 1920, bitrate: 8_000_000 })
      ).supported;
    } catch {
      avc = false;
    }
  }
  if (audioEncoder) {
    try {
      aacNative = !!(
        await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 160_000 })
      ).supported;
    } catch {
      aacNative = false;
    }
  }
  return {
    webgpu,
    shaderF16,
    webcodecs,
    videoEncoder,
    audioEncoder,
    avc,
    aacNative,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    indexedDb: typeof indexedDB !== 'undefined',
  };
}

export function asrBackendFor(c: Capabilities | null): AsrBackend {
  if (!c?.webgpu) return 'wasm';
  return c.shaderF16 ? 'webgpu-f16' : 'webgpu';
}
