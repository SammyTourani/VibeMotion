/**
 * useVoiceoverGeneration Hook
 *
 * Generates voiceovers for storyboard scenes using the /api/voiceover endpoint.
 * Returns updated scenes with voiceoverAudio paths.
 */

import { useState, useCallback } from "react";

// Scene type matching DynamicPreview
type SceneType = 'title' | 'a-roll' | 'b-roll' | 'b-roll-overlay' | 'video' | 'transition' | 'cta' | 'content';

interface Scene {
  id: string;
  type: SceneType;
  duration: number;
  description: string;
  text?: string;
  voiceover?: string;
  voiceoverAudio?: string;
  // Additional optional fields for compatibility
  order?: number;
  asset?: string;
  assetStartTime?: number;
  compositionStartTime?: number;
  words?: Array<{ text: string; start: number; end: number }>;
  overlayOnAroll?: string;
  overlayStartTime?: number;
}

// Result from voiceover generation
interface VoiceoverResult {
  sceneId: string;
  audioPath: string | null;
  audioDuration: number;
  error?: string;
}

// API response type
interface VoiceoverAPIResponse {
  success: boolean;
  results: VoiceoverResult[];
  totalGenerated: number;
  message?: string;
  error?: string;
}

// Hook options
interface UseVoiceoverGenerationOptions {
  onProgress?: (current: number, total: number) => void;
  onComplete?: (results: VoiceoverResult[]) => void;
  onError?: (error: string) => void;
}

// Hook return type
interface UseVoiceoverGenerationReturn {
  generateVoiceovers: (
    scenes: Scene[],
    voiceId?: string
  ) => Promise<VoiceoverResult[]>;
  isGenerating: boolean;
  progress: number;
  results: VoiceoverResult[];
  error: string | null;
  updateScenesWithAudio: (
    scenes: Scene[],
    results: VoiceoverResult[]
  ) => Scene[];
}

export function useVoiceoverGeneration(
  options: UseVoiceoverGenerationOptions = {}
): UseVoiceoverGenerationReturn {
  const { onComplete, onError } = options;

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<VoiceoverResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate voiceovers for scenes with voiceover text
   */
  const generateVoiceovers = useCallback(
    async (scenes: Scene[], voiceId?: string): Promise<VoiceoverResult[]> => {
      setIsGenerating(true);
      setProgress(0);
      setError(null);
      setResults([]);

      try {
        // Filter scenes that have voiceover text
        const scenesWithVoiceover = scenes.filter(
          (s) => s.voiceover && s.voiceover.trim().length > 0
        );

        if (scenesWithVoiceover.length === 0) {
          setProgress(100);
          setIsGenerating(false);
          return [];
        }

        // Call the voiceover API
        const response = await fetch("/api/voiceover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes: scenesWithVoiceover.map((s) => ({
              id: s.id,
              voiceover: s.voiceover,
              duration: s.duration,
            })),
            voiceId,
          }),
        });

        const data: VoiceoverAPIResponse = await response.json();

        if (!response.ok || !data.success) {
          const errorMessage = data.error || "Voiceover generation failed";
          setError(errorMessage);
          onError?.(errorMessage);
          return [];
        }

        setResults(data.results);
        setProgress(100);
        onComplete?.(data.results);

        return data.results;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Voiceover generation failed";
        setError(errorMessage);
        onError?.(errorMessage);
        return [];
      } finally {
        setIsGenerating(false);
      }
    },
    [onComplete, onError]
  );

  /**
   * Helper to update scenes with generated audio paths
   */
  const updateScenesWithAudio = useCallback(
    (scenes: Scene[], voiceoverResults: VoiceoverResult[]): Scene[] => {
      return scenes.map((scene) => {
        const result = voiceoverResults.find((r) => r.sceneId === scene.id);
        if (result?.audioPath) {
          return {
            ...scene,
            voiceoverAudio: result.audioPath,
          };
        }
        return scene;
      });
    },
    []
  );

  return {
    generateVoiceovers,
    isGenerating,
    progress,
    results,
    error,
    updateScenesWithAudio,
  };
}
