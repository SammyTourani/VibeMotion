"use client";

import { useState, useEffect, useCallback, useRef, startTransition, useMemo } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Play,
  Pause,
  Download,
  Loader2,
  ChevronLeft,
  Sparkles,
  Code,
  Eye,
  RotateCcw,
  Send,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Mic,
  Volume2,
  ImageIcon,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRenderStatus } from "@/hooks/useRenderStatus";
import { useVoiceoverGeneration } from "@/hooks/useVoiceoverGeneration";
import { ImageGenerationModal } from "@/components/sandbox/ImageGenerationModal";
import { VideoGenerationModal } from "@/components/sandbox/VideoGenerationModal";
import { RenderProgress } from "@/components/sandbox/RenderProgress";
import { MultiTrackTimeline } from "@/components/sandbox/MultiTrackTimeline";
import { RemotionPreviewHandle } from "@/components/sandbox/RemotionPreview";
import { TranscriptPanel, buildClipTranscripts, type ClipTranscript, type TranscriptWord } from "@/components/sandbox/TranscriptPanel";
import { secondsToFrames } from "@/src/config";
import { applyOperations } from "@/lib/modification/apply-operations";

// Dynamic import for Monaco to avoid SSR issues
const CodeEditor = dynamic(() => import("@/components/sandbox/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-900/50">
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading editor...
      </div>
    </div>
  ),
});

// Dynamic import for Remotion Player to avoid SSR issues
const RemotionPreview = dynamic(
  () => import("@/components/sandbox/RemotionPreview").then((mod) => mod.RemotionPreview),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-900/50">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading player...
        </div>
      </div>
    ),
  }
);

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface UploadedAssetInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType?: string;
  publicPath: string | null;
}

interface ProjectData {
  prompt: string;
  files: UploadedAssetInfo[];
  timestamp: number;
}

type SceneType = 'title' | 'a-roll' | 'b-roll' | 'b-roll-overlay' | 'video' | 'transition' | 'cta' | 'content';

interface StoryboardScene {
  id: string;
  order: number;
  type: SceneType;
  duration: number;
  description: string;
  text?: string;
  voiceover?: string;
  voiceoverAudio?: string;
  /** Video asset path (for a-roll/b-roll scenes) */
  asset?: string;
  /** Start time in the source video (for trimming) */
  assetStartTime?: number;
  /** Start time in the composition timeline */
  compositionStartTime?: number;
  /** Word-level transcript for captions/seeking */
  words?: TranscriptWord[];
  /** For b-roll-overlay: ID of the A-roll scene this overlays */
  overlayOnAroll?: string;
  /** For b-roll-overlay: When (in seconds) within the A-roll to show this overlay */
  overlayStartTime?: number;
}

interface Storyboard {
  scenes: StoryboardScene[];
  totalDuration: number;
  summary: string;
}

type GenerationStatus =
  | "idle"
  | "generating_storyboard"
  | "generating_code"
  | "saving_files"
  | "complete"
  | "error";

export default function SandboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [generatedCode, setGeneratedCode] = useState("");
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [panelWidth, setPanelWidth] = useState(40);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [compositionPath, setCompositionPath] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [compositionId, setCompositionId] = useState<string | null>(null);
  const [projectAssets, setProjectAssets] = useState<UploadedAssetInfo[]>([]);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [hasVoiceovers, setHasVoiceovers] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [clipTranscripts, setClipTranscripts] = useState<ClipTranscript[]>([]);
  // Derive currentPlaybackTime from currentFrame instead of separate state
  // This reduces re-renders and prevents playback jitter
  const currentPlaybackTime = currentFrame / 60;

  // Non-blocking frame update handler using startTransition
  // This allows the video to continue playing smoothly while React updates the UI
  const handleFrameUpdate = useCallback((frame: number) => {
    startTransition(() => {
      setCurrentFrame(frame);
    });
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previewRef = useRef<RemotionPreviewHandle>(null);

  // Memoized theme to prevent RemotionPreview re-renders on every frame update
  // This was causing playback jitter because the inline object created a new reference each render
  const previewTheme = useMemo(() => ({
    primaryColor: "#8B5CF6",
    backgroundColor: "#000000",
    textColor: "#FFFFFF",
  }), []);

  // Voiceover generation hook
  const {
    generateVoiceovers,
    isGenerating: isGeneratingVoiceover,
    updateScenesWithAudio,
  } = useVoiceoverGeneration({
    onComplete: (results) => {
      // Update storyboard scenes with audio paths
      if (storyboard) {
        const updatedScenes = updateScenesWithAudio(storyboard.scenes, results);
        // Preserve order field when updating scenes
        const scenesWithOrder: StoryboardScene[] = updatedScenes.map((s, i) => ({
          ...s,
          order: storyboard.scenes[i]?.order ?? i,
        }));
        setStoryboard({ ...storyboard, scenes: scenesWithOrder });
        const hasAudio = results.some((r) => r.audioPath !== null);
        setHasVoiceovers(hasAudio);
        if (hasAudio) {
          console.log("Voiceovers generated successfully");
        }
      }
    },
    onError: (error) => {
      console.error("Voiceover generation failed:", error);
    },
  });

  // Handle voiceover generation
  const handleGenerateVoiceovers = async () => {
    if (!storyboard) return;
    await generateVoiceovers(storyboard.scenes);
  };

  // Handle image generation complete
  const handleImageGenerated = (imagePath: string) => {
    // Add generated image to project assets
    const newAsset: UploadedAssetInfo = {
      id: `generated-${Date.now()}`,
      name: imagePath.split("/").pop() || "generated-image.png",
      type: "image",
      size: 0,
      mimeType: "image/png",
      publicPath: imagePath,
    };
    setProjectAssets((prev) => [...prev, newAsset]);
    console.log("Image added to assets:", imagePath);
  };

  // Handle video generation complete
  const handleVideoGenerated = (videoPath: string) => {
    // Add generated video to project assets
    const newAsset: UploadedAssetInfo = {
      id: `generated-${Date.now()}`,
      name: videoPath.split("/").pop() || "generated-video.mp4",
      type: "video",
      size: 0,
      mimeType: "video/mp4",
      publicPath: videoPath,
    };
    setProjectAssets((prev) => [...prev, newAsset]);
    console.log("Video added to assets:", videoPath);
  };

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
    onError: (error) => {
      console.error("Render failed:", error);
    },
  });

  // Handle render button click
  const handleRenderVideo = async () => {
    if (!storyboard) return;

    const newRenderId = await startRender({
      storyboard: {
        scenes: storyboard.scenes.map((scene) => ({
          id: scene.id,
          type: scene.type,
          duration: scene.duration,
          description: scene.description,
          text: scene.text,
          voiceover: scene.voiceover,
          voiceoverAudio: scene.voiceoverAudio, // Include audio path for rendering
        })),
        totalDuration: storyboard.totalDuration,
        summary: storyboard.summary,
      },
      aspectRatio: "9:16",
      theme: {
        primaryColor: "#8B5CF6",
        backgroundColor: "#000000",
        textColor: "#FFFFFF",
      },
    });

    if (newRenderId) {
      setRenderId(newRenderId);
    }
  };

  // Calculate total duration in frames for timeline
  // IMPORTANT: Exclude B-roll overlays - they play DURING A-roll, not after
  // Only sequential scenes (title, a-roll, cta, etc.) contribute to total duration
  const totalDurationInFrames = useMemo(() => {
    if (!storyboard) return 0;
    return storyboard.scenes
      .filter(s => !(s.type === "b-roll-overlay" && s.overlayOnAroll))
      .reduce((sum, s) => sum + secondsToFrames(s.duration), 0);
  }, [storyboard]);

  // Handle timeline seek
  const handleTimelineSeek = useCallback((frame: number) => {
    previewRef.current?.seekTo(frame);
    setCurrentFrame(frame);
    // currentPlaybackTime is derived from currentFrame automatically
  }, []);

  // Handle transcript seek (click on word)
  const handleTranscriptSeek = useCallback((timeInSeconds: number) => {
    const frame = Math.round(timeInSeconds * 60); // Convert seconds to frames (60fps)
    previewRef.current?.seekTo(frame);
    setCurrentFrame(frame);
    // currentPlaybackTime is derived from currentFrame automatically
  }, []);

  // Handle timeline reorder
  const handleTimelineReorder = useCallback((newScenes: StoryboardScene[]) => {
    if (!storyboard) return;
    setStoryboard({
      ...storyboard,
      scenes: newScenes.map((s, i) => ({ ...s, order: i })),
    });
  }, [storyboard]);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load project data from sessionStorage
  useEffect(() => {
    const storedData = sessionStorage.getItem("pendingProject");
    if (storedData) {
      const projectData: ProjectData = JSON.parse(storedData);

      // Ensure files array exists (defensive handling)
      const files = projectData.files || [];

      // Store assets for use in generation
      setProjectAssets(files);

      // Add initial user message
      const userMessage: Message = {
        id: "initial-prompt",
        role: "user",
        content: projectData.prompt,
        timestamp: new Date(projectData.timestamp),
      };

      // Add system message showing assets
      const assetsWithPaths = files.filter((f) => f.publicPath);
      const assetMessage: Message = {
        id: "assets-info",
        role: "system",
        content:
          files.length > 0
            ? `Uploaded ${files.length} asset${files.length !== 1 ? "s" : ""}: ${files.map((f) => f.name).join(", ")}${assetsWithPaths.length > 0 ? " (saved to server)" : ""}`
            : "No assets uploaded",
        timestamp: new Date(projectData.timestamp),
      };

      setMessages([userMessage, assetMessage]);

      // Clear session storage
      sessionStorage.removeItem("pendingProject");

      // Start generation with streaming API, passing assets
      startStreamingGeneration(projectData.prompt, files);
    }
  }, []);

  const startStreamingGeneration = async (prompt: string, assets: UploadedAssetInfo[] = []) => {
    setStatus("generating_storyboard");
    setErrorMessage(null);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    // Add initial progress message
    const progressMsgId = `msg-${Date.now()}-progress`;
    const progressMessage: Message = {
      id: progressMsgId,
      role: "assistant",
      content: "🎬 Starting intelligent video analysis...",
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, progressMessage]);

    try {
      // Convert assets to the format expected by the autonomous pipeline
      const apiAssets = assets
        .filter((a) => a.publicPath) // Only include assets with server paths
        .map((a) => ({
          id: a.id,
          name: a.name,
          publicPath: a.publicPath,
          size: a.size,
          mimeType: a.mimeType || "application/octet-stream",
          type: a.type,
        }));

      const projectId = `project-${Date.now()}`;

      // Use the AUTONOMOUS PIPELINE for intelligent processing
      const response = await fetch("/api/autonomous-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt,
          assets: apiAssets,
          config: {
            aspectRatio: "9:16",
            style: "modern",
            targetDuration: 30,
            primaryColor: "#8B5CF6",
            backgroundColor: "#000000",
            textColor: "#FFFFFF",
          },
          renderFinal: false,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let classificationSummary = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "status":
                  // General status update
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === progressMsgId
                        ? { ...m, content: `🎬 ${data.message}` }
                        : m
                    )
                  );
                  break;

                case "phase_start": {
                  const phaseIcons: Record<string, string> = {
                    upload: "📁",
                    transcribe: "🎤",
                    classify: "🏷️",
                    storyboard: "📋",
                    composition: "💻",
                    render: "🎥",
                  };
                  const phaseNames: Record<string, string> = {
                    upload: "Processing uploads",
                    transcribe: "Transcribing video audio (this takes a moment)...",
                    classify: "Classifying A-roll vs B-roll footage...",
                    storyboard: "Generating intelligent storyboard...",
                    composition: "Writing Remotion composition code...",
                    render: "Rendering final video...",
                  };
                  const icon = phaseIcons[data.phase] || "⏳";
                  const phaseName = phaseNames[data.phase] || data.phase;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === progressMsgId
                        ? { ...m, content: `${icon} ${phaseName}` }
                        : m
                    )
                  );
                  if (data.phase === "composition") {
                    setStatus("generating_code");
                  }
                  break;
                }

                case "phase_progress":
                  // Show progress within a phase
                  if (data.message) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === progressMsgId
                          ? { ...m, content: `⏳ ${data.message}` }
                          : m
                      )
                    );
                  }
                  break;

                case "phase_complete":
                  // Phase completed
                  break;

                case "transcript_ready": {
                  // Transcriptions complete - show summary
                  if (data.transcripts && Array.isArray(data.transcripts)) {
                    const transcriptCount = data.transcripts.length;
                    const totalWords = data.transcripts.reduce(
                      (sum: number, t: { wordCount?: number }) => sum + (t.wordCount || 0),
                      0
                    );
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === progressMsgId
                          ? {
                              ...m,
                              content: `🎤 Transcribed ${transcriptCount} video(s) - ${totalWords} words detected`,
                            }
                          : m
                      )
                    );
                  }
                  break;
                }

                case "classification_ready": {
                  // A-roll/B-roll classification complete
                  if (data.classification) {
                    const clips = data.classification.clips || [];
                    const aRolls = clips.filter((c: { role: string }) => c.role === "A-roll").length;
                    const bRolls = clips.filter((c: { role: string }) => c.role === "B-roll").length;
                    classificationSummary = `Found ${aRolls} A-roll (talking) and ${bRolls} B-roll (visual) clips`;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === progressMsgId
                          ? { ...m, content: `🏷️ ${classificationSummary}` }
                          : m
                      )
                    );
                  }
                  break;
                }

                case "reorder_applied": {
                  // Smart reordering was applied
                  if (data.applied && data.changes && (data.changes as Array<{clipId: string; from: number; to: number; reason: string}>).length > 0) {
                    const changes = data.changes as Array<{clipId: string; from: number; to: number; reason: string}>;
                    const changesText = changes
                      .map((c) => `• Clip moved from position ${c.from + 1} → ${c.to + 1}: ${c.reason}`)
                      .join("\n");
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === progressMsgId
                          ? {
                              ...m,
                              content: `🔄 **Clips Reordered for Better Flow**\n\n${data.reasoning}\n\n${changesText}`,
                            }
                          : m
                      )
                    );
                  }
                  break;
                }

                case "reorder_suggested": {
                  // Reorder was analyzed (may or may not be applied)
                  if (!data.applied) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === progressMsgId
                          ? { ...m, content: `✓ ${data.reasoning}` }
                          : m
                      )
                    );
                  }
                  break;
                }

                case "storyboard_ready": {
                  // Smart storyboard generated
                  if (data.storyboard) {
                    const sb = data.storyboard;
                    // Ensure scenes have order field
                    const storyboardWithOrder: Storyboard = {
                      ...sb,
                      scenes: sb.scenes.map((s: StoryboardScene, i: number) => ({
                        ...s,
                        order: s.order ?? i,
                      })),
                    };
                    setStoryboard(storyboardWithOrder);

                    // Build clip transcripts for the TranscriptPanel
                    const transcripts = buildClipTranscripts({
                      scenes: storyboardWithOrder.scenes,
                    });
                    setClipTranscripts(transcripts);

                    // Update message with storyboard summary
                    const scenesByType = storyboardWithOrder.scenes.reduce(
                      (acc: Record<string, number>, s: StoryboardScene) => {
                        acc[s.type] = (acc[s.type] || 0) + 1;
                        return acc;
                      },
                      {}
                    );
                    const typesSummary = Object.entries(scenesByType)
                      .map(([type, count]) => `${count} ${type}`)
                      .join(", ");

                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === progressMsgId
                          ? {
                              ...m,
                              content: `📋 **Storyboard Generated**\n\n${storyboardWithOrder.scenes.length} scenes (${typesSummary}), ${storyboardWithOrder.totalDuration}s total\n\n${classificationSummary ? `*${classificationSummary}*\n\n` : ""}${storyboardWithOrder.scenes.map((s: StoryboardScene, i: number) => `${i + 1}. **${s.type}** (${s.duration}s): ${s.description}`).join("\n")}`,
                            }
                          : m
                      )
                    );
                  }
                  break;
                }

                case "composition_ready":
                  // Composition code generated
                  if (data.code) {
                    setGeneratedCode(data.code);
                  }
                  if (data.compositionPath) {
                    setCompositionPath(data.compositionPath);
                  }
                  if (data.compositionId) {
                    setCompositionId(data.compositionId);
                  }
                  setStatus("saving_files");
                  break;

                case "complete":
                case "pipeline_complete": {
                  setStatus("complete");
                  // Store final composition info
                  if (data.compositionPath) {
                    setCompositionPath(data.compositionPath);
                  }
                  if (data.compositionId) {
                    setCompositionId(data.compositionId);
                  }
                  // Mark progress message as complete and add completion message
                  // (only if not already added, to prevent duplicate key errors)
                  setMessages((prev) => {
                    const updatedMessages = prev.map((m) =>
                      m.id === progressMsgId ? { ...m, isStreaming: false } : m
                    );
                    // Check if completion message already exists
                    if (updatedMessages.some((m) => m.content.includes("Video composition ready"))) {
                      return updatedMessages;
                    }
                    // Add completion message
                    const completeMessage: Message = {
                      id: `msg-${Date.now()}-complete-${Math.random().toString(36).slice(2, 8)}`,
                      role: "assistant",
                      content: data.compositionId
                        ? `✅ **Video composition ready!**\n\nComposition ID: **${data.compositionId}**\n\nYou can preview it on the right, view/edit the generated code, or refine with follow-up prompts like:\n- "Make the intro shorter"\n- "Swap scenes 2 and 3"\n- "Remove the transition"`
                        : "✅ Your video composition is ready! Preview it on the right or iterate with follow-up prompts.",
                      timestamp: new Date(),
                    };
                    return [...updatedMessages, completeMessage];
                  });
                  break;
                }

                case "error":
                case "pipeline_error":
                case "phase_error":
                  throw new Error(data.message || data.error || "Pipeline error");
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                // Incomplete JSON, wait for more data
                continue;
              }
              throw e;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Generation was cancelled
        return;
      }

      console.error("Generation error:", error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");

      // Add error message
      const errorMsg: Message = {
        id: `msg-${Date.now()}-error`,
        role: "system",
        content: `❌ Error: ${error instanceof Error ? error.message : "Generation failed"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue("");

    // MODIFICATION MODE: If storyboard exists, try to modify it first
    if (storyboard && storyboard.scenes.length > 0) {
      try {
        const response = await fetch('/api/modify-storyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: currentInput,
            existingStoryboard: storyboard,
            assets: projectAssets,
          }),
        });

        const result = await response.json();

        if (result.success && !result.requiresRegeneration) {
          // Apply operations to storyboard state
          const updatedStoryboard = applyOperations(storyboard, result.operations);
          setStoryboard(updatedStoryboard);

          // Add success message
          setMessages((prev) => [...prev, {
            id: `msg-${Date.now()}-response`,
            role: "assistant",
            content: result.message,
            timestamp: new Date(),
          }]);
          return;
        }

        // If modification couldn't be done, fall through to regeneration
        if (result.requiresRegeneration) {
          setMessages((prev) => [...prev, {
            id: `msg-${Date.now()}-response`,
            role: "assistant",
            content: result.message + " Starting new generation...",
            timestamp: new Date(),
          }]);
        } else if (!result.success) {
          // Couldn't understand the modification
          setMessages((prev) => [...prev, {
            id: `msg-${Date.now()}-response`,
            role: "assistant",
            content: result.message,
            timestamp: new Date(),
          }]);
          return;
        }
      } catch (error) {
        console.error('Modification failed:', error);
        // Fall through to regeneration
      }
    } else {
      // No storyboard yet, show regeneration message
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-response`,
        role: "assistant",
        content: "I'll create a video based on your request...",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }

    // CREATION MODE: Generate from scratch
    await startStreamingGeneration(currentInput, projectAssets);
  };

  // Panel resize handler
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      setPanelWidth(Math.min(Math.max(newWidth, 25), 60));
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const getStatusText = () => {
    switch (status) {
      case "generating_storyboard":
        return "Generating storyboard...";
      case "generating_code":
        return "Writing Remotion code...";
      case "saving_files":
        return "Saving composition...";
      case "complete":
        return "Ready to preview";
      case "error":
        return "Error occurred";
      default:
        return "Ready";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "generating_storyboard":
      case "generating_code":
      case "saving_files":
        return <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />;
      case "complete":
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "generating_storyboard":
      case "generating_code":
      case "saving_files":
        return "text-yellow-400";
      case "complete":
        return "text-green-400";
      case "error":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 h-14 border-b border-white/10 flex items-center justify-between px-4 bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="font-medium">Video Generation</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className={`text-sm ${getStatusColor()}`}>
              {getStatusText()}
            </span>
          </div>

          {/* Actions */}
          {status === "complete" && (
            <>
              {/* Generate Image Button */}
              <motion.button
                onClick={() => setShowImageModal(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg text-sm font-medium"
              >
                <ImageIcon className="w-4 h-4" />
                Generate Image
              </motion.button>

              {/* Generate Video Button */}
              <motion.button
                onClick={() => setShowVideoModal(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg text-sm font-medium"
              >
                <Video className="w-4 h-4" />
                Generate Video
              </motion.button>

              {/* Voiceover Generation Button */}
              {!hasVoiceovers && storyboard?.scenes.some((s) => s.voiceover) && (
                <motion.button
                  onClick={handleGenerateVoiceovers}
                  disabled={isGeneratingVoiceover}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingVoiceover ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Voiceovers...
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Generate Voiceovers
                    </>
                  )}
                </motion.button>
              )}

              {/* Voiceovers Ready Indicator */}
              {hasVoiceovers && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-lg text-sm text-green-400">
                  <Volume2 className="w-4 h-4" />
                  Voiceovers Ready
                </div>
              )}

              {/* Render/Download Button */}
              {isRenderComplete && renderOutputPath ? (
                <motion.a
                  href={renderOutputPath}
                  download
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </motion.a>
              ) : isRendering ? (
                <motion.button
                  disabled
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600/50 to-purple-600/50 rounded-lg text-sm font-medium cursor-not-allowed"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rendering {renderProgress}%
                </motion.button>
              ) : isRenderError ? (
                <motion.button
                  onClick={handleRenderVideo}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 rounded-lg text-sm font-medium"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retry Render
                </motion.button>
              ) : (
                <motion.button
                  onClick={handleRenderVideo}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg text-sm font-medium"
                >
                  <FileVideo className="w-4 h-4" />
                  Render Video
                </motion.button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel */}
        <div
          className="flex flex-col border-r border-white/10 bg-gray-900/30"
          style={{ width: `${panelWidth}%` }}
        >
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-purple-600 text-white"
                      : message.role === "system"
                        ? "bg-white/5 text-gray-400 text-sm"
                        : "bg-white/10 text-white"
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {/* Simple markdown-like rendering */}
                    {message.content.split("\n").map((line, i) => {
                      if (line.startsWith("**") && line.endsWith("**")) {
                        return (
                          <div key={i} className="font-bold text-white">
                            {line.slice(2, -2)}
                          </div>
                        );
                      }
                      if (line.startsWith("```")) {
                        return null; // Skip code blocks header/footer
                      }
                      if (line.match(/^\d+\.\s\*\*/)) {
                        const [num, rest] = line.split("**");
                        const [title, desc] = rest ? rest.split("**") : ["", ""];
                        return (
                          <div key={i} className="mt-1">
                            <span className="text-gray-400">{num}</span>
                            <span className="font-medium">{title}</span>
                            {desc}
                          </div>
                        );
                      }
                      return (
                        <div key={i}>
                          {line || <br />}
                        </div>
                      );
                    })}
                  </div>
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-white/50 animate-pulse ml-1" />
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <div className="flex-shrink-0 p-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Ask to modify the video..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                disabled={
                  status === "generating_storyboard" ||
                  status === "generating_code" ||
                  status === "saving_files"
                }
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSendMessage}
                disabled={
                  !inputValue.trim() ||
                  status === "generating_storyboard" ||
                  status === "generating_code" ||
                  status === "saving_files"
                }
                className="p-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded-xl transition-colors"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="w-1 bg-white/5 hover:bg-purple-500/50 cursor-col-resize transition-colors flex-shrink-0"
          onMouseDown={() => setIsDragging(true)}
        />

        {/* Preview panel */}
        <div className="flex-1 flex flex-col bg-black min-w-0">
          {/* Preview toolbar */}
          <div className="flex-shrink-0 h-12 border-b border-white/10 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCode(false)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  !showCode
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={() => setShowCode(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  showCode
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Code className="w-4 h-4" />
                Code
              </button>
            </div>

            {!showCode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => setCurrentFrame(0)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Preview content */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            {showCode ? (
              <div className="w-full h-full">
                <CodeEditor
                  code={generatedCode || "// Generated code will appear here..."}
                  readOnly={true}
                />
              </div>
            ) : (
              <div className="relative aspect-[9/16] h-full max-h-[calc(100vh-200px)] bg-gradient-to-br from-violet-900/50 to-black rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
                {status === "complete" && storyboard ? (
                  <RemotionPreview
                    ref={previewRef}
                    storyboard={storyboard}
                    isPlaying={isPlaying}
                    onPlayChange={setIsPlaying}
                    onFrameChange={handleFrameUpdate}
                    aspectRatio="9:16"
                    theme={previewTheme}
                    showControls={true}
                    loop={true}
                  />
                ) : status === "error" ? (
                  <div className="text-center text-red-400 p-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm font-medium mb-2">Generation Failed</p>
                    <p className="text-xs text-red-400/70">
                      {errorMessage || "An error occurred"}
                    </p>
                  </div>
                ) : status === "complete" && !storyboard ? (
                  <div className="text-center text-gray-400 p-8">
                    <div className="w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
                      <Play className="w-10 h-10" />
                    </div>
                    <p className="text-sm font-medium mb-2">No Preview Available</p>
                    <p className="text-xs text-gray-500">
                      Storyboard generation required
                    </p>
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 opacity-50" />
                    <p className="text-sm">Generating video...</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interactive Multi-Track Timeline */}
          {!showCode && storyboard && (
            <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
              <MultiTrackTimeline
                scenes={storyboard.scenes}
                currentFrame={currentFrame}
                totalDurationInFrames={totalDurationInFrames}
                fps={60}
                onSeek={handleTimelineSeek}
                onReorder={handleTimelineReorder}
              />
            </div>
          )}

          {/* Render Progress */}
          {renderId && (
            <div className="flex-shrink-0 px-4 pb-4">
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
            </div>
          )}
        </div>

        {/* Transcript Panel - Phase 12 */}
        {clipTranscripts.length > 0 && (
          <div
            className={`transition-all duration-300 ease-in-out ${
              showTranscript ? "w-80" : "w-0"
            } flex-shrink-0`}
          >
            <TranscriptPanel
              clips={clipTranscripts}
              currentTime={currentPlaybackTime}
              onSeek={handleTranscriptSeek}
              isVisible={showTranscript}
              onToggle={() => setShowTranscript(!showTranscript)}
            />
          </div>
        )}
      </div>

      {/* Image Generation Modal */}
      <ImageGenerationModal
        isOpen={showImageModal}
        onClose={() => setShowImageModal(false)}
        onImageGenerated={handleImageGenerated}
      />

      {/* Video Generation Modal */}
      <VideoGenerationModal
        isOpen={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        onVideoGenerated={handleVideoGenerated}
      />
    </div>
  );
}
