/**
 * useImageGeneration Hook
 *
 * Generates images using the /api/generate-image endpoint.
 * Returns the local image path for use in video compositions.
 */

import { useState, useCallback } from "react";

// Aspect ratio options
export const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "1:1", label: "1:1 (Square)" },
  { value: "9:16", label: "9:16 (Portrait/Vertical)" },
  { value: "4:3", label: "4:3 (Standard)" },
  { value: "3:4", label: "3:4 (Portrait)" },
] as const;

// Resolution options
export const RESOLUTIONS = [
  { value: "2K", label: "2K (Standard)" },
  { value: "4K", label: "4K (High Quality)" },
  { value: "8K", label: "8K (Ultra High)" },
] as const;

export type AspectRatio = "16:9" | "1:1" | "9:16" | "4:3" | "3:4";
export type Resolution = "2K" | "4K" | "8K";

// Image generation options
export interface ImageGenerationOptions {
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  filename?: string;
}

// Result from image generation
export interface ImageGenerationResult {
  imagePath: string | null;
  imageUrl: string | null;
  predictionId: string | null;
  generationTime: number | null;
}

// API response type
interface GenerateImageAPIResponse {
  success: boolean;
  imagePath?: string;
  imageUrl?: string;
  predictionId?: string;
  generationTime?: number;
  error?: string;
}

// Hook options
export interface UseImageGenerationOptions {
  onComplete?: (result: ImageGenerationResult) => void;
  onError?: (error: string) => void;
}

// Hook return type
export interface UseImageGenerationReturn {
  generateImage: (
    prompt: string,
    options?: ImageGenerationOptions
  ) => Promise<ImageGenerationResult | null>;
  isGenerating: boolean;
  result: ImageGenerationResult | null;
  error: string | null;
  reset: () => void;
}

export function useImageGeneration(
  options: UseImageGenerationOptions = {}
): UseImageGenerationReturn {
  const { onComplete, onError } = options;

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ImageGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate an image from a text prompt
   */
  const generateImage = useCallback(
    async (
      prompt: string,
      genOptions: ImageGenerationOptions = {}
    ): Promise<ImageGenerationResult | null> => {
      setIsGenerating(true);
      setError(null);
      setResult(null);

      try {
        // Validate prompt
        if (!prompt || prompt.trim().length === 0) {
          const errorMessage = "Prompt is required";
          setError(errorMessage);
          onError?.(errorMessage);
          return null;
        }

        // Call the generate-image API
        const response = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            aspectRatio: genOptions.aspectRatio || "16:9",
            resolution: genOptions.resolution || "2K",
            outputFormat: "png",
            filename: genOptions.filename,
          }),
        });

        const data: GenerateImageAPIResponse = await response.json();

        if (!response.ok || !data.success) {
          const errorMessage = data.error || "Image generation failed";
          setError(errorMessage);
          onError?.(errorMessage);
          return null;
        }

        const generationResult: ImageGenerationResult = {
          imagePath: data.imagePath || null,
          imageUrl: data.imageUrl || null,
          predictionId: data.predictionId || null,
          generationTime: data.generationTime || null,
        };

        setResult(generationResult);
        onComplete?.(generationResult);

        return generationResult;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Image generation failed";
        setError(errorMessage);
        onError?.(errorMessage);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [onComplete, onError]
  );

  /**
   * Reset the hook state
   */
  const reset = useCallback(() => {
    setIsGenerating(false);
    setResult(null);
    setError(null);
  }, []);

  return {
    generateImage,
    isGenerating,
    result,
    error,
    reset,
  };
}
