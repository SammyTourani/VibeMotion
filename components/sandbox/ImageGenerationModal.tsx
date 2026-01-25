/**
 * ImageGenerationModal Component
 *
 * A modal dialog for generating AI images using Replicate's Nano Banana Pro model.
 * Allows users to enter prompts, select options, and preview generated images.
 */

"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  Download,
  Plus,
  AlertCircle,
} from "lucide-react";
import {
  useImageGeneration,
  ASPECT_RATIOS,
  RESOLUTIONS,
  AspectRatio,
  Resolution,
} from "@/hooks/useImageGeneration";

interface ImageGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageGenerated?: (imagePath: string) => void;
}

export function ImageGenerationModal({
  isOpen,
  onClose,
  onImageGenerated,
}: ImageGenerationModalProps) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [resolution, setResolution] = useState<Resolution>("2K");

  const { generateImage, isGenerating, result, error, reset } =
    useImageGeneration({
      onComplete: (res) => {
        if (res.imagePath) {
          console.log("Image generated:", res.imagePath);
        }
      },
      onError: (err) => {
        console.error("Image generation error:", err);
      },
    });

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    await generateImage(prompt, {
      aspectRatio,
      resolution,
    });
  };

  const handleAddToAssets = () => {
    if (result?.imagePath) {
      onImageGenerated?.(result.imagePath);
      handleClose();
    }
  };

  const handleClose = () => {
    reset();
    setPrompt("");
    onClose();
  };

  const handleDownload = () => {
    const imageUrl = result?.imagePath
      ? `/${result.imagePath}`
      : result?.imageUrl;
    if (imageUrl) {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Example prompts for inspiration
  const examplePrompts = [
    "A futuristic city skyline at sunset with neon lights",
    "Professional studio setup with warm lighting, 4K quality",
    "Abstract geometric patterns in vibrant purple and blue",
    "Minimalist workspace with modern tech equipment",
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
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Generate Image
                    </h2>
                    <p className="text-sm text-gray-400">
                      Powered by Nano Banana Pro
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
                {/* Prompt Input */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Prompt
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want to generate..."
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    rows={3}
                    disabled={isGenerating}
                  />
                  {/* Example Prompts */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {examplePrompts.map((example, index) => (
                      <button
                        key={index}
                        onClick={() => setPrompt(example)}
                        className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-white transition-colors"
                        disabled={isGenerating}
                      >
                        {example.slice(0, 30)}...
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Aspect Ratio */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Aspect Ratio
                    </label>
                    <select
                      value={aspectRatio}
                      onChange={(e) =>
                        setAspectRatio(e.target.value as AspectRatio)
                      }
                      className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={isGenerating}
                    >
                      {ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio.value} value={ratio.value}>
                          {ratio.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Resolution */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Resolution
                    </label>
                    <select
                      value={resolution}
                      onChange={(e) =>
                        setResolution(e.target.value as Resolution)
                      }
                      className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={isGenerating}
                    >
                      {RESOLUTIONS.map((res) => (
                        <option key={res.value} value={res.value}>
                          {res.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {/* Result Preview */}
                {result && (result.imagePath || result.imageUrl) && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-300">
                      Generated Image
                    </label>
                    <div className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700">
                      <img
                        src={
                          result.imagePath
                            ? `/${result.imagePath}`
                            : result.imageUrl || ""
                        }
                        alt="Generated"
                        className="w-full h-auto max-h-64 object-contain"
                      />
                      {result.generationTime && (
                        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-xs text-gray-300">
                          Generated in {result.generationTime.toFixed(1)}s
                        </div>
                      )}
                    </div>

                    {/* Action Buttons for Result */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddToAssets}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-medium hover:from-purple-500 hover:to-pink-500 transition-colors"
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

                {/* Generate Button */}
                {!result && (
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-pink-500 transition-all"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating Image...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5" />
                        Generate Image
                      </>
                    )}
                  </button>
                )}

                {/* Generate Another Button */}
                {result && (
                  <button
                    onClick={reset}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-700 rounded-lg text-white font-medium hover:bg-gray-600 transition-colors"
                  >
                    <Sparkles className="w-5 h-5" />
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
