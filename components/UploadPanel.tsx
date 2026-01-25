"use client";

import { useState, useCallback } from "react";
import UploadZone from "./UploadZone";
import ClipThumbnails from "./ClipThumbnails";
import TranscriptView from "./TranscriptView";
import ChatInterface from "./ChatInterface";
import type { VideoClip } from "@/lib/types";
import { clipStorage } from "@/lib/storage";
import { transcribeClips } from "@/lib/transcribe";

type TabView = "clips" | "chat";

interface UploadPanelProps {
  clips: VideoClip[];
  onClipsChange: (clips: VideoClip[]) => void;
  isLoading: boolean;
}

export default function UploadPanel({
  clips,
  onClipsChange,
  isLoading,
}: UploadPanelProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabView>("clips");
  const [transcribeProgress, setTranscribeProgress] = useState({
    current: 0,
    total: 0,
    clipName: "",
  });

  const handleClipsAdded = useCallback(
    (newClips: VideoClip[]) => {
      onClipsChange([...clips, ...newClips]);
    },
    [clips, onClipsChange]
  );

  const handleRemoveClip = useCallback(
    async (id: string) => {
      try {
        await clipStorage.deleteClip(id);
        onClipsChange(clips.filter((clip) => clip.id !== id));
      } catch (error) {
        console.error("Failed to remove clip:", error);
        alert("Failed to remove clip");
      }
    },
    [clips, onClipsChange]
  );

  const handleTranscribeAll = async () => {
    if (clips.length === 0) {
      alert("No clips to transcribe");
      return;
    }

    // Check if API key is likely configured
    if (
      !process.env.NEXT_PUBLIC_OPENAI_API_KEY &&
      typeof window !== "undefined"
    ) {
      const hasKey = confirm(
        "OpenAI API key may not be configured. Transcription requires an OpenAI API key.\n\n" +
          "Set OPENAI_API_KEY environment variable and restart the server.\n\n" +
          "Continue anyway?"
      );
      if (!hasKey) return;
    }

    setIsTranscribing(true);

    try {
      await transcribeClips(
        clips,
        // Progress callback
        (current, total, clipName) => {
          setTranscribeProgress({ current, total, clipName });
        },
        // Clip complete callback
        async (clipId, transcript) => {
          const updatedClips = clips.map((clip) =>
            clip.id === clipId
              ? {
                  ...clip,
                  transcript,
                  transcriptStatus: "complete" as const,
                }
              : clip
          );
          onClipsChange(updatedClips);

          // Update in IndexedDB
          const clip = clips.find((c) => c.id === clipId);
          if (clip) {
            await clipStorage.saveClip({
              ...clip,
              transcript,
              transcriptStatus: "complete",
            });
          }
        },
        // Error callback
        async (clipId, error) => {
          const updatedClips = clips.map((clip) =>
            clip.id === clipId
              ? { ...clip, transcriptStatus: "error" as const }
              : clip
          );
          onClipsChange(updatedClips);

          // Update in IndexedDB
          const clip = clips.find((c) => c.id === clipId);
          if (clip) {
            await clipStorage.saveClip({
              ...clip,
              transcriptStatus: "error",
            });
          }

          alert(`Failed to transcribe ${clip?.name}: ${error}`);
        }
      );

      alert("Transcription complete!");
    } catch (error) {
      console.error("Transcription error:", error);
      alert("Transcription failed. Check console for details.");
    } finally {
      setIsTranscribing(false);
      setTranscribeProgress({ current: 0, total: 0, clipName: "" });
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900">
          Stan Video Editor
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Upload clips, chat with AI, create videos
        </p>

        {/* Tab Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setActiveTab("clips")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "clips"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Clips ({clips.length})
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "chat"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            AI Chat
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === "clips" ? (
          <div className="p-6 space-y-4">
            {/* Upload Zone */}
            <UploadZone
              onClipsAdded={handleClipsAdded}
              currentClipCount={clips.length}
              maxClips={5}
            />

            {/* Uploaded Clips */}
            <ClipThumbnails clips={clips} onRemove={handleRemoveClip} />

            {/* Transcribe Button */}
            {clips.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleTranscribeAll}
                  disabled={isTranscribing}
                  className={`
                    w-full py-3 px-4 rounded-lg font-medium text-sm
                    transition-colors
                    ${
                      isTranscribing
                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }
                  `}
                >
                  {isTranscribing
                    ? `Transcribing ${transcribeProgress.current}/${transcribeProgress.total}...`
                    : "🎤 Transcribe All Clips"}
                </button>

                {/* Progress indicator */}
                {isTranscribing && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-blue-900">
                        Processing: {transcribeProgress.clipName}
                      </p>
                    </div>
                    <div className="mt-2 w-full bg-blue-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all"
                        style={{
                          width: `${(transcribeProgress.current / transcribeProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Transcript View */}
            <TranscriptView clips={clips} />

            {/* Info Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">
                🎯 Phase 5: Auto-Stitch
              </h3>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>✅ OpenAI Whisper integration</li>
                <li>✅ Word-level timestamps</li>
                <li>✅ AI chat with Claude</li>
                <li>✅ Video preview with Remotion</li>
                <li>✅ Export to MP4</li>
              </ul>
            </div>
          </div>
        ) : (
          <ChatInterface clips={clips} />
        )}
      </div>
    </div>
  );
}
