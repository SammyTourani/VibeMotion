"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Download,
  FileVideo,
  Loader2,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { projectStorage } from "@/lib/project-storage";
import ProgressBar, { type PhaseData } from "@/components/generation/ProgressBar";
import PhaseStatus from "@/components/generation/PhaseStatus";
import { useRenderStatus } from "@/hooks/useRenderStatus";
import { RenderProgress } from "@/components/sandbox/RenderProgress";

type PipelineState = "idle" | "initializing" | "running" | "complete" | "error";

interface PipelineResult {
  compositionId?: string;
  compositionPath?: string;
  executionTime?: number;
  transcripts?: Array<{
    assetId: string;
    publicPath: string;
    text: string;
    wordCount: number;
    duration: number;
  }>;
  classification?: {
    clips: Array<{
      name: string;
      role: "A-roll" | "B-roll";
      confidence: number;
    }>;
    summary: {
      aRollCount: number;
      bRollCount: number;
      narrativeStrength: string;
    };
  };
  storyboard?: {
    scenes: Array<{
      type: string;
      duration: number;
      description: string;
    }>;
    totalDuration: number;
    summary: string;
  };
}

const INITIAL_PHASES: PhaseData[] = [
  { name: "upload", status: "pending", progress: 0 },
  { name: "transcribe", status: "pending", progress: 0 },
  { name: "classify", status: "pending", progress: 0 },
  { name: "storyboard", status: "pending", progress: 0 },
  { name: "composition", status: "pending", progress: 0 },
  { name: "render", status: "pending", progress: 0 },
];

export default function GeneratePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  // State
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");
  const [phases, setPhases] = useState<PhaseData[]>(INITIAL_PHASES);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult>({});
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);

  // Render status hook
  const {
    status: renderStatus,
    progress: renderProgress,
    outputPath: renderOutputPath,
    error: renderError,
    startRender,
    isRendering,
    isComplete: isRenderComplete,
    isError: isRenderError,
  } = useRenderStatus(renderId, {
    onComplete: (outputPath) => {
      console.log("Render complete:", outputPath);
    },
    onError: (err) => {
      console.error("Render failed:", err);
    },
  });

  // Handle export button click
  const handleExportVideo = async () => {
    if (!result.storyboard) return;

    // Map aspect ratio to supported values (render API only supports 9:16, 16:9, 1:1)
    const projectAspectRatio = project?.theme.aspectRatio;
    const aspectRatio: "9:16" | "16:9" | "1:1" =
      projectAspectRatio === "16:9" ? "16:9" :
      projectAspectRatio === "1:1" ? "1:1" :
      "9:16"; // Default to 9:16 for "4:5" and "9:16"

    const newRenderId = await startRender({
      storyboard: {
        scenes: result.storyboard.scenes.map((scene, i) => ({
          id: `scene-${i}`,
          type: scene.type,
          duration: scene.duration,
          description: scene.description,
        })),
        totalDuration: result.storyboard.totalDuration,
        summary: result.storyboard.summary,
      },
      aspectRatio,
      theme: {
        primaryColor: project?.theme.primaryColor || "#8B5CF6",
        backgroundColor: project?.theme.backgroundColor || "#000000",
        textColor: project?.theme.textColor || "#FFFFFF",
      },
    });

    if (newRenderId) {
      setRenderId(newRenderId);
    }
  };

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);

  // Apply landing page styles
  useEffect(() => {
    document.body.classList.add("landing-page");
    return () => {
      document.body.classList.remove("landing-page");
    };
  }, []);

  // Load project
  useEffect(() => {
    const loadProject = async () => {
      try {
        const p = await projectStorage.getProject(projectId);
        setProject(p);
      } catch (err) {
        console.error("Failed to load project:", err);
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  // Update phase status
  const updatePhase = useCallback((phaseName: string, update: Partial<PhaseData>) => {
    setPhases((prev) =>
      prev.map((p) => (p.name === phaseName ? { ...p, ...update } : p))
    );
  }, []);

  // Handle SSE event
  const handleEvent = useCallback(
    (eventData: { type: string; [key: string]: unknown }) => {
      const { type, ...data } = eventData;

      switch (type) {
        case "status":
          console.log("[Generate] Pipeline started:", data);
          break;

        case "phase_start": {
          const startPhase = data.phase as string;
          setCurrentPhase(startPhase);
          updatePhase(startPhase, {
            status: "running",
            progress: 0,
            message: data.message as string | undefined,
          });
          break;
        }

        case "phase_progress": {
          const progressPhase = data.phase as string;
          updatePhase(progressPhase, {
            progress: (data.progress as number) || 0,
            message: data.message as string | undefined,
          });
          break;
        }

        case "phase_complete": {
          const completePhase = data.phase as string;
          updatePhase(completePhase, {
            status: "complete",
            progress: 100,
          });
          break;
        }

        case "phase_error": {
          const errorPhase = data.phase as string;
          updatePhase(errorPhase, {
            status: "error",
            message: data.error as string | undefined,
          });
          break;
        }

        case "transcript_ready":
          setResult((prev) => ({
            ...prev,
            transcripts: (data.transcripts as PipelineResult["transcripts"]) || [],
          }));
          break;

        case "classification_ready":
          setResult((prev) => ({
            ...prev,
            classification: data.classification as PipelineResult["classification"],
          }));
          break;

        case "storyboard_ready":
          setResult((prev) => ({
            ...prev,
            storyboard: data.storyboard as PipelineResult["storyboard"],
          }));
          break;

        case "composition_ready":
          setResult((prev) => ({
            ...prev,
            compositionId: data.compositionId as string,
            compositionPath: data.compositionPath as string,
          }));
          break;

        case "complete":
          setResult((prev) => ({
            ...prev,
            compositionId: data.compositionId as string,
            compositionPath: data.compositionPath as string,
            executionTime: data.executionTime as number,
          }));
          setPipelineState("complete");
          setCurrentPhase(null);

          // Update skipped phases (like render in preview mode)
          setPhases((prev) =>
            prev.map((p) =>
              p.status === "pending" ? { ...p, status: "skipped" } : p
            )
          );

          // Update project status in storage
          if (project) {
            projectStorage.updateProject({
              ...project,
              status: "preview",
              compositionCode: data.compositionId as string,
            });
          }
          break;

        case "error":
          setError(data.message as string);
          setPipelineState("error");
          setCurrentPhase(null);
          break;
      }
    },
    [updatePhase, project]
  );

  // Parse SSE data from stream
  const parseSSEEvents = (text: string): Array<Record<string, unknown>> => {
    const events: Array<Record<string, unknown>> = [];
    const lines = text.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const jsonStr = line.slice(6);
          const data = JSON.parse(jsonStr);
          events.push(data);
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }

    return events;
  };

  // Start pipeline
  const startPipeline = useCallback(async () => {
    if (!project || project.assets.length === 0) {
      setError("No assets to process");
      setPipelineState("error");
      return;
    }

    // Reset state
    setPhases(INITIAL_PHASES);
    setResult({});
    setError(null);
    setPipelineState("initializing");
    setStartTime(Date.now());

    // Prepare assets for pipeline
    const pipelineAssets = project.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      publicPath: asset.publicPath || `assets/videos/${asset.id}.mp4`,
      size: asset.size,
      mimeType: asset.mimeType,
      type: asset.type,
    }));

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      setPipelineState("running");

      const response = await fetch("/api/autonomous-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          assets: pipelineAssets,
          prompt: project.prompt,
          config: {
            aspectRatio: project.theme.aspectRatio,
            style: project.theme.style,
            primaryColor: project.theme.primaryColor,
            backgroundColor: project.theme.backgroundColor,
            textColor: project.theme.textColor,
          },
          renderFinal: false, // Preview only for now
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Pipeline request failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining buffer
          if (buffer) {
            const events = parseSSEEvents(buffer);
            for (const event of events) {
              handleEvent(event as { type: string; [key: string]: unknown });
            }
          }
          break;
        }

        // Append to buffer and process complete events
        buffer += decoder.decode(value, { stream: true });

        // Process complete events (ending with \n\n)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || ""; // Keep incomplete part in buffer

        for (const part of parts) {
          const events = parseSSEEvents(part + "\n\n");
          for (const event of events) {
            handleEvent(event as { type: string; [key: string]: unknown });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        console.log("[Generate] Pipeline aborted");
        return;
      }

      console.error("[Generate] Pipeline error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setPipelineState("error");
    }
  }, [project, handleEvent]);

  // Auto-start pipeline when project loads
  useEffect(() => {
    if (project && !hasStartedRef.current && pipelineState === "idle") {
      hasStartedRef.current = true;
      startPipeline();
    }
  }, [project, pipelineState, startPipeline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Retry handler
  const handleRetry = () => {
    hasStartedRef.current = false;
    setPipelineState("idle");
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen animated-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading project...</p>
        </div>
      </div>
    );
  }

  // Project not found
  if (!project) {
    return (
      <div className="min-h-screen animated-gradient flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
          <p className="text-gray-400 mb-6">
            The project you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link href="/upload" className="btn-primary">
            Create New Project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen animated-gradient">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-xl font-semibold">VibeMotion</span>
          </Link>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                pipelineState === "complete"
                  ? "bg-green-500/20 text-green-400"
                  : pipelineState === "error"
                  ? "bg-red-500/20 text-red-400"
                  : pipelineState === "running"
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-gray-500/20 text-gray-400"
              }`}
            >
              {pipelineState === "complete"
                ? "Complete"
                : pipelineState === "error"
                ? "Error"
                : pipelineState === "running"
                ? "Generating..."
                : "Initializing"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center mx-auto mb-6"
          >
            <Sparkles className="w-10 h-10 text-purple-400" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold mb-3"
          >
            {pipelineState === "complete"
              ? "Your Video is Ready!"
              : pipelineState === "error"
              ? "Generation Failed"
              : "Generating Your Video"}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400"
          >
            {pipelineState === "complete"
              ? "Your video has been generated successfully. Preview it now!"
              : pipelineState === "error"
              ? "Something went wrong during generation."
              : "AI is analyzing your videos and creating a masterpiece..."}
          </motion.p>
        </div>

        {/* Progress Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-6 mb-8"
        >
          <ProgressBar phases={phases} currentPhase={currentPhase || undefined} />
        </motion.div>

        {/* Error Message */}
        <AnimatePresence>
          {pipelineState === "error" && error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="card p-4 mb-8 border-red-500/50 bg-red-500/10"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-red-400 mb-1">Error</h3>
                  <p className="text-sm text-gray-400">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Message */}
        <AnimatePresence>
          {pipelineState === "complete" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="card p-4 mb-8 border-green-500/50 bg-green-500/10"
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-400 mb-1">Success!</h3>
                  <p className="text-sm text-gray-400">
                    Your video composition has been generated
                    {result.executionTime &&
                      ` in ${(result.executionTime / 1000).toFixed(1)} seconds`}
                    .
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase Status Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <PhaseStatus
            phases={phases}
            transcripts={result.transcripts}
            classification={result.classification}
            storyboard={result.storyboard}
            startTime={startTime || undefined}
          />
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-4 mt-8"
        >
          <Link
            href="/upload"
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Upload
          </Link>

          {pipelineState === "error" && (
            <button onClick={handleRetry} className="btn-primary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}

          {pipelineState === "complete" && result.compositionId && (
            <>
              <button
                onClick={() => router.push(`/sandbox?compositionId=${result.compositionId}`)}
                className="btn-primary flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Preview Video
              </button>

              {/* Export Button */}
              {isRenderComplete && renderOutputPath ? (
                <motion.a
                  href={renderOutputPath}
                  download
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="btn-primary flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600"
                >
                  <Download className="w-4 h-4" />
                  Download MP4
                </motion.a>
              ) : isRendering ? (
                <button
                  disabled
                  className="btn-secondary flex items-center gap-2 opacity-50 cursor-not-allowed"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rendering {renderProgress}%
                </button>
              ) : (
                <button
                  onClick={handleExportVideo}
                  disabled={!result.storyboard}
                  className="btn-secondary flex items-center gap-2"
                >
                  <FileVideo className="w-4 h-4" />
                  Export MP4
                </button>
              )}
            </>
          )}
        </motion.div>

        {/* Render Progress */}
        {renderId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <RenderProgress
              status={
                isRenderComplete
                  ? "complete"
                  : isRenderError
                    ? "error"
                    : isRendering
                      ? "rendering"
                      : renderStatus === "pending"
                        ? "pending"
                        : "idle"
              }
              progress={renderProgress}
              outputPath={renderOutputPath}
              error={renderError}
              onCancel={() => setRenderId(null)}
            />
          </motion.div>
        )}

        {/* Project Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card p-6 mt-8"
        >
          <h3 className="text-sm font-medium text-gray-400 mb-4">Project Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block mb-1">Assets</span>
              <span className="font-medium">{project.assets.length} files</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Style</span>
              <span className="font-medium capitalize">{project.theme.style}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Aspect</span>
              <span className="font-medium">{project.theme.aspectRatio}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Status</span>
              <span className="font-medium capitalize">{pipelineState}</span>
            </div>
          </div>
          {project.prompt && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <span className="text-gray-500 text-sm block mb-2">Prompt</span>
              <p className="text-gray-300 text-sm">{project.prompt}</p>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
