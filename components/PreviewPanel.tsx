"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { VideoClip } from "@/lib/types";

// Portrait-1080p preset
const VIDEO_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
};

interface PreviewPanelProps {
  clips: VideoClip[];
}

export default function PreviewPanel({ clips }: PreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Create blob URLs for video files
  useEffect(() => {
    const newBlobUrls = new Map<string, string>();

    clips.forEach((clip) => {
      if (clip.file) {
        const url = URL.createObjectURL(clip.file);
        newBlobUrls.set(clip.id, url);
      }
    });

    setBlobUrls(newBlobUrls);

    // Cleanup old blob URLs
    return () => {
      newBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [clips]);

  // Get current clip blob URL
  const currentClip = clips[currentClipIndex];
  const currentBlobUrl = currentClip ? blobUrls.get(currentClip.id) : null;

  // Calculate total duration
  const totalDuration = useMemo(() => {
    return clips.reduce((sum, clip) => sum + (clip.duration || 0), 0);
  }, [clips]);

  // Handle video end - move to next clip
  const handleVideoEnded = useCallback(() => {
    if (currentClipIndex < clips.length - 1) {
      setCurrentClipIndex((prev) => prev + 1);
    } else {
      setCurrentClipIndex(0);
      setIsPlaying(false);
    }
  }, [currentClipIndex, clips.length]);

  // Auto-play next clip when index changes
  useEffect(() => {
    if (isPlaying && videoRef.current && currentBlobUrl) {
      videoRef.current.play().catch(console.error);
    }
  }, [currentClipIndex, isPlaying, currentBlobUrl]);

  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handlePrevClip = useCallback(() => {
    setCurrentClipIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextClip = useCallback(() => {
    setCurrentClipIndex((prev) => Math.min(clips.length - 1, prev + 1));
  }, [clips.length]);

  // Export functionality - opens Remotion Studio instructions
  const handleExport = useCallback(async () => {
    if (clips.length === 0) {
      alert("No clips to export. Please upload some video clips first.");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      // Show export instructions
      for (let i = 0; i <= 100; i += 20) {
        setExportProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      alert(
        "To export your video:\n\n" +
          "1. Open terminal in project folder\n" +
          "2. Run: pnpm studio\n" +
          "3. Select your composition\n" +
          "4. Click 'Render' button\n\n" +
          "Your clips are ready for export!"
      );
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [clips]);

  const hasClips = clips.length > 0;

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Preview</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded">
              Phase 5
            </span>
            <span className="text-xs text-gray-400">
              Portrait {VIDEO_CONFIG.width}x{VIDEO_CONFIG.height}
            </span>
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="max-h-full flex flex-col items-center">
          {/* Video Container - Portrait Aspect Ratio */}
          <div
            className="bg-black rounded-lg overflow-hidden shadow-2xl relative"
            style={{
              width: "300px",
              height: "533px", // 9:16 aspect ratio
            }}
          >
            {hasClips && currentBlobUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={currentBlobUrl}
                  className="w-full h-full object-contain"
                  onEnded={handleVideoEnded}
                  playsInline
                  muted={false}
                />
                {/* Clip indicator */}
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-xs">
                  Clip {currentClipIndex + 1}/{clips.length}
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 space-y-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="space-y-2 text-center">
                  <p className="text-sm font-medium text-white">Video Preview</p>
                  <p className="text-xs text-gray-400">
                    Upload clips to see your video
                  </p>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  9:16 • {VIDEO_CONFIG.width}x{VIDEO_CONFIG.height}
                </div>
              </div>
            )}
          </div>

          {/* Clip Info */}
          {hasClips && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-300">
                {clips.length} clip{clips.length !== 1 ? "s" : ""} •{" "}
                {totalDuration.toFixed(1)}s total
              </p>
              {currentClip && (
                <p className="text-xs text-gray-500 mt-1 truncate max-w-[280px]">
                  {currentClip.name}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 border-t border-gray-700 bg-gray-800 space-y-3">
        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handlePrevClip}
            disabled={!hasClips || currentClipIndex === 0}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasClips && currentClipIndex > 0
                ? "text-white bg-gray-700 hover:bg-gray-600"
                : "text-gray-500 bg-gray-700 cursor-not-allowed"
            }`}
          >
            ⏮ Prev
          </button>
          <button
            onClick={handlePlayPause}
            disabled={!hasClips}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasClips
                ? "text-white bg-blue-600 hover:bg-blue-700"
                : "text-gray-500 bg-gray-700 cursor-not-allowed"
            }`}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            onClick={handleNextClip}
            disabled={!hasClips || currentClipIndex === clips.length - 1}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasClips && currentClipIndex < clips.length - 1
                ? "text-white bg-gray-700 hover:bg-gray-600"
                : "text-gray-500 bg-gray-700 cursor-not-allowed"
            }`}
          >
            Next ⏭
          </button>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={!hasClips || isExporting}
          className={`w-full py-3 px-4 text-sm font-medium rounded-lg transition-colors ${
            hasClips && !isExporting
              ? "text-white bg-green-600 hover:bg-green-700"
              : "text-gray-500 bg-gray-700 cursor-not-allowed"
          }`}
        >
          {isExporting
            ? `Preparing... ${exportProgress}%`
            : "📥 Export Video (MP4)"}
        </button>

        {/* Export Progress */}
        {isExporting && (
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
        )}

        {/* Help text */}
        <p className="text-xs text-gray-500 text-center">
          Use Remotion Studio (pnpm studio) for full export
        </p>
      </div>
    </div>
  );
}
