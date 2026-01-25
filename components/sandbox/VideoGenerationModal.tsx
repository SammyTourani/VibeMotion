/**
 * VideoGenerationModal Component
 *
 * A modal dialog for generating AI videos using Google's Veo 3.1 Fast model.
 * Features progress tracking, duration selection, and video preview.
 */

"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Video,
  Loader2,
  Download,
  Plus,
  AlertCircle,
  Play,
  Clock,
} from "lucide-react";
import {
  useVideoGeneration,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VideoAspectRatio,
  VideoDuration,
  suggestDuration,
} from "@/hooks/useVideoGeneration";

interface VideoGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoGenerated?: (videoPath: string) => void;
}

export function VideoGenerationModal({
  isOpen,
  onClose,
  onVideoGenerated,
}: VideoGenerationModalProps) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("16:9");
  const [duration, setDuration] = useState<VideoDuration>(6);
  const [startingFrameUrl, setStartingFrameUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    startGeneration,
    cancelGeneration,
    isGenerating,
    status,
    elapsedTime,
    estimatedTime,
    result,
    error,
    reset,
  } = useVideoGeneration({
    onComplete: (res) => {
      if (res.videoPath) {
        console.log("Video generated:", res.videoPath);
      }
    },
    onError: (err) => {
      console.error("Video generation error:", err);
    },
  });

  // Auto-suggest duration when prompt changes
  useEffect(() => {
    if (prompt.trim()) {
      const suggested = suggestDuration(prompt);
      setDuration(suggested);
    }
  }, [prompt]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    await startGeneration(prompt, {
      aspectRatio,
      duration,
      startingFrameUrl: startingFrameUrl || undefined,
    });
  };

  const handleAddToAssets = () => {
    if (result?.videoPath) {
      onVideoGenerated?.(result.videoPath);
      handleClose();
    }
  };

  const handleClose = () => {
    if (isGenerating) {
      cancelGeneration();
    }
    reset();
    setPrompt("");
    setStartingFrameUrl("");
    setShowAdvanced(false);
    onClose();
  };

  const handleDownload = () => {
    const videoUrl = result?.videoPath
      ? `/${result.videoPath}`
      : result?.videoUrl;
    if (videoUrl) {
      const link = document.createElement("a");
      link.href = videoUrl;
      link.download = `generated-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Calculate progress percentage
  const progressPercent = Math.min(
    Math.round((elapsedTime / estimatedTime) * 100),
    95
  );

  // Example prompts
  const examplePrompts = [
    "Developer says 'Hello, this is my new app'",
    "Person waves hello and smiles at the camera",
    "Software engineer explaining code on a monitor",
    "Excited creator announces 'Check out this feature!'",
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-700">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg">
                    <Video className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Generate Video
                    </h2>
                    <p className="text-sm text-gray-400">
                      Powered by Veo 3.1 Fast
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                {/* Generation in progress */}
                {isGenerating && (
                  <div className="space-y-4 p-6 bg-gray-800/50 rounded-xl border border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                        <div>
                          <p className="font-medium text-white">
                            {status === "starting"
                              ? "Starting generation..."
                              : "Generating video..."}
                          </p>
                          <p className="text-sm text-gray-400">
                            This typically takes 90-120 seconds
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={cancelGeneration}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Progress</span>
                        <span className="text-gray-300">
                          {elapsedTime}s / ~{estimatedTime}s
                        </span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Result Preview */}
                {result && (result.videoPath || result.videoUrl) && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-300">
                      Generated Video
                    </label>
                    <div className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700">
                      <video
                        src={
                          result.videoPath
                            ? `/${result.videoPath}`
                            : result.videoUrl || ""
                        }
                        controls
                        className="w-full h-auto max-h-64"
                        autoPlay
                        loop
                      />
                      <div className="absolute bottom-2 right-2 flex items-center gap-2">
                        <div className="px-2 py-1 bg-black/70 rounded text-xs text-gray-300">
                          {result.duration}s
                        </div>
                        <div className="px-2 py-1 bg-black/70 rounded text-xs text-gray-300">
                          Generated in {result.generationTime.toFixed(1)}s
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons for Result */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddToAssets}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg text-white font-medium hover:from-orange-500 hover:to-red-500 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add to Assets
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 rounded-lg text-white font-medium hover:bg-gray-600 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {error && !isGenerating && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {/* Input Form (hidden during generation or when result exists) */}
                {!isGenerating && !result && (
                  <>
                    {/* Prompt Input */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Prompt
                      </label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the video you want to generate..."
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                        rows={3}
                      />
                      {/* Example Prompts */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {examplePrompts.map((example, index) => (
                          <button
                            key={index}
                            onClick={() => setPrompt(example)}
                            className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-white transition-colors"
                          >
                            {example.slice(0, 35)}...
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration Selection */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Duration
                      </label>
                      <div className="flex gap-2">
                        {VIDEO_DURATIONS.map((d) => (
                          <button
                            key={d.value}
                            onClick={() => setDuration(d.value)}
                            className={`flex-1 flex flex-col items-center px-4 py-3 rounded-lg border transition-colors ${
                              duration === d.value
                                ? "bg-orange-500/20 border-orange-500 text-orange-400"
                                : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-medium">
                              <Clock className="w-4 h-4" />
                              {d.value}s
                            </div>
                            <span className="text-xs mt-1 opacity-75">
                              {d.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aspect Ratio */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Aspect Ratio
                      </label>
                      <div className="flex gap-2">
                        {VIDEO_ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio.value}
                            onClick={() => setAspectRatio(ratio.value)}
                            className={`flex-1 px-4 py-2.5 rounded-lg border transition-colors ${
                              aspectRatio === ratio.value
                                ? "bg-orange-500/20 border-orange-500 text-orange-400"
                                : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                            }`}
                          >
                            {ratio.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Advanced Options Toggle */}
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {showAdvanced ? "Hide" : "Show"} advanced options
                    </button>

                    {/* Advanced Options */}
                    {showAdvanced && (
                      <div className="space-y-2 pt-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Starting Frame URL (optional)
                        </label>
                        <input
                          type="url"
                          value={startingFrameUrl}
                          onChange={(e) => setStartingFrameUrl(e.target.value)}
                          placeholder="https://example.com/reference-image.png"
                          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <p className="text-xs text-gray-500">
                          Provide a reference image to maintain consistent
                          appearance
                        </p>
                      </div>
                    )}

                    {/* Generate Button */}
                    <button
                      onClick={handleGenerate}
                      disabled={!prompt.trim()}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-500 hover:to-red-500 transition-all"
                    >
                      <Play className="w-5 h-5" />
                      Generate {duration}-Second Video
                    </button>

                    {/* Time Estimate */}
                    <p className="text-center text-xs text-gray-500">
                      Video generation typically takes 90-120 seconds
                    </p>
                  </>
                )}

                {/* Generate Another Button */}
                {result && (
                  <button
                    onClick={reset}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-700 rounded-lg text-white font-medium hover:bg-gray-600 transition-colors"
                  >
                    <Video className="w-5 h-5" />
                    Generate Another
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
