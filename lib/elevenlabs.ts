/**
 * ElevenLabs API Client
 *
 * Provides text-to-speech generation using ElevenLabs API.
 * Used for generating voiceovers from storyboard scene scripts.
 */

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Voice settings for fine-tuning output
export interface VoiceSettings {
  stability?: number; // 0-1, default 0.5 - higher = more consistent
  similarity_boost?: number; // 0-1, default 0.75 - higher = more similar to original voice
  style?: number; // 0-1, default 0 - style exaggeration
  use_speaker_boost?: boolean; // Enhance speaker clarity
}

// Request to generate speech
export interface TTSRequest {
  text: string;
  voiceId: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
}

// Response from TTS generation
export interface TTSResponse {
  audio: Buffer;
  contentType: string;
}

// Voice information from ElevenLabs
export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string;
  labels: Record<string, string>;
}

// Default voice settings optimized for voiceovers
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
};

// Default voice ID - Rachel (calm, professional female voice)
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

// Popular voice IDs for quick reference
export const VOICE_IDS = {
  rachel: "21m00Tcm4TlvDq8ikWAM", // Female, calm, professional
  domi: "AZnzlk1XvdvUeBnXmlld", // Female, strong, confident
  bella: "EXAVITQu4vr4xnSDxMaL", // Female, soft, gentle
  antoni: "ErXwobaYiN019PkySvjV", // Male, warm, professional
  josh: "TxGEqnHWrfWFTfGW9XjX", // Male, deep, narrative
  arnold: "VR6AewLTigWG4xSOukaG", // Male, crisp, energetic
  adam: "pNInz6obpgDQGcFmaJgB", // Male, deep, authoritative
  sam: "yoZ06aMxZJJ28mfd3POQ", // Male, raspy, dynamic
} as const;

/**
 * Generate speech from text using ElevenLabs TTS API
 */
export async function generateSpeech(request: TTSRequest): Promise<TTSResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  const {
    text,
    voiceId,
    modelId = "eleven_multilingual_v2",
    voiceSettings = DEFAULT_VOICE_SETTINGS,
  } = request;

  if (!text || text.trim().length === 0) {
    throw new Error("Text is required for speech generation");
  }

  if (text.length > 5000) {
    throw new Error("Text exceeds maximum length of 5000 characters");
  }

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = `ElevenLabs API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail?.message) {
        errorMessage = `ElevenLabs error: ${errorData.detail.message}`;
      } else if (errorData.detail) {
        errorMessage = `ElevenLabs error: ${JSON.stringify(errorData.detail)}`;
      }
    } catch {
      // Could not parse error response
    }
    throw new Error(errorMessage);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  return {
    audio: audioBuffer,
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}

/**
 * Get list of available voices from ElevenLabs
 */
export async function getVoices(): Promise<Voice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch voices: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.voices as Voice[];
}

/**
 * Estimate audio duration from MP3 buffer
 * Note: This is an approximation based on average bitrate
 * For production, use ffprobe or audio parsing library
 */
export function estimateAudioDuration(buffer: Buffer): number {
  // ElevenLabs typically outputs at 128kbps for MP3
  const bitrate = 128; // kbps
  const fileSizeBytes = buffer.length;
  // Formula: duration = (fileSize * 8) / (bitrate * 1000)
  const durationSeconds = (fileSizeBytes * 8) / (bitrate * 1000);
  return Math.round(durationSeconds * 100) / 100; // Round to 2 decimal places
}

/**
 * Check if ElevenLabs API key is configured
 */
export function isConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

// ============================================
// Sound Effects Generation
// ============================================

// Request to generate sound effect
export interface SFXRequest {
  /** Text description of the sound effect to generate */
  text: string;
  /** Duration of the sound effect in seconds (0.5-22) */
  durationSeconds?: number;
  /** How much the prompt influences generation (0-1) */
  promptInfluence?: number;
}

// Response from sound effect generation
export interface SFXResponse {
  audio: Buffer;
  contentType: string;
}

/**
 * Generate a sound effect from text description using ElevenLabs Sound Generation API
 *
 * @see https://elevenlabs.io/docs/api-reference/sound-generation
 */
export async function generateSoundEffect(request: SFXRequest): Promise<SFXResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  const {
    text,
    durationSeconds = 2.0,
    promptInfluence = 0.3,
  } = request;

  if (!text || text.trim().length === 0) {
    throw new Error("Text description is required for sound effect generation");
  }

  if (text.length > 1000) {
    throw new Error("Text description exceeds maximum length of 1000 characters");
  }

  if (durationSeconds < 0.5 || durationSeconds > 22) {
    throw new Error("Duration must be between 0.5 and 22 seconds");
  }

  const response = await fetch(
    `${ELEVENLABS_API_URL}/sound-generation`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.trim(),
        duration_seconds: durationSeconds,
        prompt_influence: promptInfluence,
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = `ElevenLabs SFX API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail?.message) {
        errorMessage = `ElevenLabs SFX error: ${errorData.detail.message}`;
      } else if (errorData.detail) {
        errorMessage = `ElevenLabs SFX error: ${JSON.stringify(errorData.detail)}`;
      }
    } catch {
      // Could not parse error response
    }
    throw new Error(errorMessage);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  return {
    audio: audioBuffer,
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}
