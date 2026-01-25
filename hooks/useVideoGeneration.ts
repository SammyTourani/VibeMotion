/**
 * useVideoGeneration Hook
 *
 * Generates AI videos using the /api/generate-ai-video endpoint.
 * Uses polling to check status since video generation takes 90-120 seconds.
 */

import { useState, useCallback, useEffect, useRef } from "react";

// Video aspect ratios
export const VIDEO_ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "9:16", label: "9:16 (Vertical)" },
  { value: "1:1", label: "1:1 (Square)" },
] as const;

// Video durations
export const VIDEO_DURATIONS = [
  { value: 4, label: "4 seconds", description: "Short clips, quick actions" },
  { value: 6, label: "6 seconds", description: "Standard dialogue" },
  { value: 8, label: "8 seconds", description: "Longer content" },
] as const;

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoDuration = 4 | 6 | 8;
export type VideoStatus = "idle" | "starting" | "processing" | "succeeded" | "failed";

// Video generation options
export interface VideoGenerationOptions {
  aspectRatio?: VideoAspectRatio;
  duration?: VideoDuration;
  startingFrameUrl?: string;
}

// Result from video generation
export interface VideoGenerationResult {
  videoPath: string | null;
  videoUrl: string | null;
  predictionId: string | null;
  generationTime: number;
  duration: VideoDuration;
}

// API response types
interface StartResponse {
  success: boolean;
  predictionId?: string;
  estimatedTime?: number;
  error?: string;
}

interface StatusResponse {
  success: boolean;
  status: VideoStatus;
  videoPath?: string;
  videoUrl?: string;
  generationTime?: number;
  error?: string;
}

// Hook options
export interface UseVideoGenerationOptions {
  pollInterval?: number; // Default 5000ms (5s)
  timeout?: number; // Default 180000ms (3 minutes)
  onComplete?: (result: VideoGenerationResult) => void;
  onError?: (error: string) => void;
  onProgress?: (elapsedTime: number) => void;
}

// Hook return type
export interface UseVideoGenerationReturn {
  startGeneration: (
    prompt: string,
    options?: VideoGenerationOptions
  ) => Promise<string | null>;
  cancelGeneration: () => void;
  isGenerating: boolean;
  status: VideoStatus;
  elapsedTime: number;
  estimatedTime: number;
  result: VideoGenerationResult | null;
  error: string | null;
  reset: () => void;
}

/**
 * Suggest optimal video duration based on prompt content
 * ~2 words per second for natural speech
 */
export function suggestDuration(prompt: string): VideoDuration {
  const quotedMatch = prompt.match(/"([^"]+)"|'([^']+)'/);
  const quotedText = quotedMatch?.[1] || quotedMatch?.[2] || "";
  const textToAnalyze = quotedText || prompt;
  const wordCount = textToAnalyze.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 8) return 4;
  if (wordCount <= 16) return 6;
  return 8;
}

export function useVideoGeneration(
  options: UseVideoGenerationOptions = {}
): UseVideoGenerationReturn {
  const {
    pollInterval = 5000,
    timeout = 180000,
    onComplete,
    onError,
    onProgress,
  } = options;

  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<VideoStatus>("idle");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(95);
  const [result, setResult] = useState<VideoGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const predictionIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<VideoDuration>(6);
  const isCancelledRef = useRef(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  /**
   * Poll for video generation status
   */
  const pollStatus = useCallback(async () => {
    if (!predictionIdRef.current || isCancelledRef.current) return;

    try {
      const response = await fetch(
        `/api/generate-ai-video?id=${predictionIdRef.current}`
      );
      const data: StatusResponse = await response.json();

      // Update elapsed time
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      setElapsedTime(elapsed);
      onProgress?.(elapsed);

      // Check for timeout
      if (elapsed * 1000 > timeout) {
        setError("Video generation timed out. Please try again.");
        setStatus("failed");
        setIsGenerating(false);
        onError?.("Video generation timed out");
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        return;
      }

      // Update status
      setStatus(data.status);

      if (data.status === "succeeded") {
        // Generation complete
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }

        const generationResult: VideoGenerationResult = {
          videoPath: data.videoPath || null,
          videoUrl: data.videoUrl || null,
          predictionId: predictionIdRef.current,
          generationTime: data.generationTime || elapsed,
          duration: durationRef.current,
        };

        setResult(generationResult);
        setIsGenerating(false);
        onComplete?.(generationResult);
      } else if (data.status === "failed") {
        // Generation failed
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }

        const errorMessage = data.error || "Video generation failed";
        setError(errorMessage);
        setIsGenerating(false);
        onError?.(errorMessage);
      }
      // If still processing, continue polling
    } catch (err) {
      console.error("Polling error:", err);
      // Don't stop on transient errors, just log
    }
  }, [timeout, onComplete, onError, onProgress]);

  /**
   * Start video generation
   */
  const startGeneration = useCallback(
    async (
      prompt: string,
      genOptions: VideoGenerationOptions = {}
    ): Promise<string | null> => {
      // Reset state
      setIsGenerating(true);
      setStatus("starting");
      setElapsedTime(0);
      setError(null);
      setResult(null);
      isCancelledRef.current = false;

      const duration = genOptions.duration || 6;
      durationRef.current = duration;

      try {
        // Validate prompt
        if (!prompt || prompt.trim().length === 0) {
          const errorMessage = "Prompt is required";
          setError(errorMessage);
          setStatus("failed");
          setIsGenerating(false);
          onError?.(errorMessage);
          return null;
        }

        // Start generation
        const response = await fetch("/api/generate-ai-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            aspectRatio: genOptions.aspectRatio || "16:9",
            duration,
            startingFrameUrl: genOptions.startingFrameUrl,
          }),
        });

        const data: StartResponse = await response.json();

        if (!response.ok || !data.success || !data.predictionId) {
          const errorMessage = data.error || "Failed to start video generation";
          setError(errorMessage);
          setStatus("failed");
          setIsGenerating(false);
          onError?.(errorMessage);
          return null;
        }

        // Store prediction ID and start polling
        predictionIdRef.current = data.predictionId;
        startTimeRef.current = Date.now();
        setEstimatedTime(data.estimatedTime || 95);
        setStatus("processing");

        // Start polling
        pollIntervalRef.current = setInterval(pollStatus, pollInterval);

        return data.predictionId;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Video generation failed";
        setError(errorMessage);
        setStatus("failed");
        setIsGenerating(false);
        onError?.(errorMessage);
        return null;
      }
    },
    [pollInterval, pollStatus, onError]
  );

  /**
   * Cancel ongoing generation
   */
  const cancelGeneration = useCallback(() => {
    isCancelledRef.current = true;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    setIsGenerating(false);
    setStatus("idle");
    setError("Generation cancelled");
  }, []);

  /**
   * Reset the hook state
   */
  const reset = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    predictionIdRef.current = null;
    isCancelledRef.current = false;
    setIsGenerating(false);
    setStatus("idle");
    setElapsedTime(0);
    setEstimatedTime(95);
    setResult(null);
    setError(null);
  }, []);

  return {
    startGeneration,
    cancelGeneration,
    isGenerating,
    status,
    elapsedTime,
    estimatedTime,
    result,
    error,
    reset,
  };
}
