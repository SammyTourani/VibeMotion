"use client";

import { useState } from "react";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  isDisabled: boolean;
  assetCount: number;
}

const examplePrompts = [
  "Create a 15-second product showcase with fast cuts and upbeat music",
  "Make a testimonial video with smooth transitions and professional look",
  "Build an energetic app promo for TikTok with hook in first 3 seconds",
  "Design a cinematic brand intro with logo reveal and dramatic music",
];

export default function PromptInput({
  value,
  onChange,
  onGenerate,
  isDisabled,
  assetCount,
}: PromptInputProps) {
  const [showExamples, setShowExamples] = useState(false);

  const canGenerate = value.trim().length > 10 && assetCount > 0 && !isDisabled;

  return (
    <div className="space-y-4">
      {/* Label */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">
          Describe Your Video
        </h3>
        <button
          onClick={() => setShowExamples(!showExamples)}
          className="text-xs text-purple-400 hover:text-purple-300"
        >
          {showExamples ? "Hide examples" : "Show examples"}
        </button>
      </div>

      {/* Example prompts */}
      {showExamples && (
        <div className="space-y-2">
          {examplePrompts.map((prompt, index) => (
            <button
              key={index}
              onClick={() => onChange(prompt)}
              className="w-full text-left p-3 rounded-lg bg-white/5 border border-gray-800 text-sm text-gray-400 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the video you want to create. Include details about style, pacing, music, and any specific scenes or effects you want..."
        className="textarea min-h-[150px]"
        disabled={isDisabled}
      />

      {/* Character count */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {value.length} characters
          {value.length < 10 && value.length > 0 && (
            <span className="text-orange-400 ml-2">
              (minimum 10 characters)
            </span>
          )}
        </span>
        <span>
          {assetCount === 0 ? (
            <span className="text-orange-400">Upload at least 1 asset</span>
          ) : (
            <span className="text-green-400">{assetCount} assets ready</span>
          )}
        </span>
      </div>

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={!canGenerate}
        className={`w-full py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-3 ${
          canGenerate
            ? "btn-primary glow-primary"
            : "bg-gray-800 text-gray-500 cursor-not-allowed"
        }`}
      >
        {isDisabled ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Generate Video
          </>
        )}
      </button>

      {/* Info text */}
      <p className="text-xs text-gray-600 text-center">
        AI will create a storyboard and generate your video. This may take a few
        minutes.
      </p>
    </div>
  );
}
