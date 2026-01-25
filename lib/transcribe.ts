/**
 * Transcription utilities
 */

import type { VideoClip, TranscriptData } from "./types";

/**
 * Transcribe a single video clip using OpenAI Whisper API
 */
export async function transcribeClip(clip: VideoClip): Promise<TranscriptData> {
  const formData = new FormData();
  formData.append("file", clip.file);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Transcription failed");
  }

  const transcriptData: TranscriptData = await response.json();
  return transcriptData;
}

/**
 * Transcribe multiple clips sequentially with progress callbacks
 */
export async function transcribeClips(
  clips: VideoClip[],
  onProgress?: (current: number, total: number, clipName: string) => void,
  onClipComplete?: (clipId: string, transcript: TranscriptData) => void,
  onClipError?: (clipId: string, error: string) => void
): Promise<void> {
  const clipsToTranscribe = clips.filter(
    (clip) => clip.transcriptStatus === "pending"
  );

  for (let i = 0; i < clipsToTranscribe.length; i++) {
    const clip = clipsToTranscribe[i];

    try {
      onProgress?.(i + 1, clipsToTranscribe.length, clip.name);

      const transcript = await transcribeClip(clip);

      onClipComplete?.(clip.id, transcript);
    } catch (error: any) {
      console.error(`Failed to transcribe ${clip.name}:`, error);
      onClipError?.(clip.id, error.message || "Transcription failed");
    }
  }
}
