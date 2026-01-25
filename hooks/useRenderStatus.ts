/**
 * useRenderStatus Hook
 *
 * Polls the /api/render endpoint for render job status updates.
 * Automatically stops polling when the job is complete or errors out.
 */

import { useState, useEffect, useCallback } from "react";

export interface RenderStatus {
  status: "idle" | "pending" | "rendering" | "complete" | "error";
  progress: number;
  outputPath: string | null;
  error: string | null;
}

interface UseRenderStatusOptions {
  pollingInterval?: number; // milliseconds, default 1000
  onComplete?: (outputPath: string) => void;
  onError?: (error: string) => void;
}

export function useRenderStatus(
  renderId: string | null,
  options: UseRenderStatusOptions = {}
) {
  const { pollingInterval = 1000, onComplete, onError } = options;

  const [status, setStatus] = useState<RenderStatus>({
    status: "idle",
    progress: 0,
    outputPath: null,
    error: null,
  });

  // Reset status when renderId changes
  useEffect(() => {
    if (!renderId) {
      setStatus({
        status: "idle",
        progress: 0,
        outputPath: null,
        error: null,
      });
      return;
    }

    // Initialize to pending when a new render starts
    setStatus({
      status: "pending",
      progress: 0,
      outputPath: null,
      error: null,
    });
  }, [renderId]);

  // Poll for status updates
  useEffect(() => {
    if (!renderId) return;

    let isCancelled = false;
    let intervalId: NodeJS.Timeout;

    const pollStatus = async () => {
      if (isCancelled) return;

      try {
        const response = await fetch(`/api/render?id=${renderId}`);
        const data = await response.json();

        if (isCancelled) return;

        if (!response.ok) {
          setStatus({
            status: "error",
            progress: 0,
            outputPath: null,
            error: data.error || "Failed to fetch render status",
          });
          clearInterval(intervalId);
          onError?.(data.error || "Failed to fetch render status");
          return;
        }

        setStatus({
          status: data.status,
          progress: data.progress || 0,
          outputPath: data.outputPath,
          error: data.error,
        });

        // Stop polling when complete or error
        if (data.status === "complete") {
          clearInterval(intervalId);
          onComplete?.(data.outputPath);
        } else if (data.status === "error") {
          clearInterval(intervalId);
          onError?.(data.error || "Render failed");
        }
      } catch (error) {
        if (isCancelled) return;
        console.error("Failed to poll render status:", error);
        // Don't stop polling on network errors, might be temporary
      }
    };

    // Start polling immediately
    pollStatus();
    intervalId = setInterval(pollStatus, pollingInterval);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [renderId, pollingInterval, onComplete, onError]);

  // Helper to start a new render
  const startRender = useCallback(
    async (request: {
      storyboard: {
        scenes: Array<{
          id: string;
          type: string;
          duration: number;
          description: string;
          text?: string;
          assets?: string[];
          voiceover?: string;
          animation?: string;
          order?: number;
        }>;
        totalDuration: number;
        summary: string;
      };
      aspectRatio: "9:16" | "16:9" | "1:1";
      theme: {
        primaryColor: string;
        secondaryColor?: string;
        backgroundColor: string;
        textColor: string;
        style?: string;
      };
    }): Promise<string | null> => {
      try {
        setStatus({
          status: "pending",
          progress: 0,
          outputPath: null,
          error: null,
        });

        const response = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          setStatus({
            status: "error",
            progress: 0,
            outputPath: null,
            error: data.error || "Failed to start render",
          });
          onError?.(data.error || "Failed to start render");
          return null;
        }

        return data.renderId;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to start render";
        setStatus({
          status: "error",
          progress: 0,
          outputPath: null,
          error: errorMessage,
        });
        onError?.(errorMessage);
        return null;
      }
    },
    [onError]
  );

  return {
    ...status,
    startRender,
    isRendering: status.status === "pending" || status.status === "rendering",
    isComplete: status.status === "complete",
    isError: status.status === "error",
  };
}
