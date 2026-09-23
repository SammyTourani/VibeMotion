// Whisper models offered for transcription. All are multilingual and export
// the cross-attention heads that word-level timestamps need.
//
// Download sizes were measured from the Hugging Face file listings for the
// exact files each configuration fetches (ONNX weights + tokenizer/config,
// ~2.8 MB), plus the ONNX Runtime WebAssembly module (~5.5 MB compressed)
// that every configuration needs once. Browsers cache all of it after the
// first run.

export type AsrModelId = 'fast' | 'accurate';
export type AsrDevice = 'webgpu' | 'wasm';
/**
 * webgpu-f16: fp16 encoder + q4f16 decoder, when the GPU supports shader-f16.
 * On our test clip it produced the same words and timestamps as fp32/q4 at
 * about half the download. webgpu: the fp32/q4 pair from HF's WebGPU Whisper
 * demos. wasm: q8, as in HF's word-timestamp demo.
 */
export type AsrBackend = 'webgpu-f16' | 'webgpu' | 'wasm';
export const deviceOf = (b: AsrBackend): AsrDevice => (b === 'wasm' ? 'wasm' : 'webgpu');

export interface AsrModel {
  id: AsrModelId;
  label: string;
  repo: string;
  blurb: string;
  /** Per-module dtypes. The encoder is quantization-sensitive; the decoder is not. */
  dtype: Record<AsrBackend, Record<string, string>>;
  /** Measured download in MB, per backend. */
  downloadMB: Record<AsrBackend, number>;
}

const RUNTIME_MB = 5.5;
const TOKENIZER_MB = 2.8;

export const ASR_MODELS: Record<AsrModelId, AsrModel> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    repo: 'onnx-community/whisper-base_timestamped',
    blurb: 'Whisper Base. Good for clear speech.',
    dtype: {
      'webgpu-f16': { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
      webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    },
    downloadMB: {
      'webgpu-f16': Math.round(41.3 + 68.5 + TOKENIZER_MB + RUNTIME_MB),
      webgpu: Math.round(82.5 + 123.7 + TOKENIZER_MB + RUNTIME_MB),
      wasm: Math.round(23.2 + 53.7 + TOKENIZER_MB + RUNTIME_MB),
    },
  },
  accurate: {
    id: 'accurate',
    label: 'Accurate',
    repo: 'onnx-community/whisper-small_timestamped',
    blurb: 'Whisper Small. Better with accents, noise and names.',
    dtype: {
      'webgpu-f16': { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
      webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    },
    downloadMB: {
      'webgpu-f16': Math.round(176.5 + 145.8 + TOKENIZER_MB + RUNTIME_MB),
      webgpu: Math.round(352.8 + 233.4 + TOKENIZER_MB + RUNTIME_MB),
      wasm: Math.round(92.2 + 156.8 + TOKENIZER_MB + RUNTIME_MB),
    },
  },
};

/** Whisper's languages, most common first for the picker. */
export const LANGUAGES: [code: string, name: string][] = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'],
  ['it', 'Italian'], ['nl', 'Dutch'], ['hi', 'Hindi'], ['ar', 'Arabic'], ['zh', 'Chinese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['ru', 'Russian'], ['tr', 'Turkish'], ['pl', 'Polish'],
  ['uk', 'Ukrainian'], ['vi', 'Vietnamese'], ['id', 'Indonesian'], ['th', 'Thai'], ['sv', 'Swedish'],
  ['da', 'Danish'], ['no', 'Norwegian'], ['fi', 'Finnish'], ['el', 'Greek'], ['he', 'Hebrew'],
  ['cs', 'Czech'], ['ro', 'Romanian'], ['hu', 'Hungarian'], ['fa', 'Persian'], ['ur', 'Urdu'],
  ['bn', 'Bengali'], ['ta', 'Tamil'], ['ms', 'Malay'], ['tl', 'Tagalog'], ['ca', 'Catalan'],
];

export function languageName(code: string): string {
  return LANGUAGES.find(([c]) => c === code)?.[1] ?? code.toUpperCase();
}
