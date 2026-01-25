"use client";

import type { VideoClip } from "@/lib/types";

interface TranscriptViewProps {
  clips: VideoClip[];
}

export default function TranscriptView({ clips }: TranscriptViewProps) {
  // Filter clips that have transcripts
  const transcribedClips = clips.filter(
    (clip) => clip.transcript && clip.transcriptStatus === "complete"
  );

  if (transcribedClips.length === 0) {
    return null;
  }

  // Calculate total word count
  const totalWords = transcribedClips.reduce(
    (sum, clip) => sum + (clip.transcript?.words.length || 0),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          Transcript ({totalWords} words)
        </h3>
        <button
          onClick={() => {
            // Copy transcript to clipboard
            const fullText = transcribedClips
              .map((clip, index) => {
                return `[Clip ${index + 1}: ${clip.name}]\n${clip.transcript?.text || ""}\n`;
              })
              .join("\n");
            navigator.clipboard.writeText(fullText);
            alert("Transcript copied to clipboard!");
          }}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          Copy all
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
        {transcribedClips.map((clip, index) => (
          <div
            key={clip.id}
            className="p-4 border-b border-gray-100 last:border-b-0"
          >
            {/* Clip header */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                {index + 1}
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">
                {clip.name}
              </p>
              <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                {clip.transcript?.words.length} words
              </span>
            </div>

            {/* Transcript text */}
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {clip.transcript?.text || ""}
            </p>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{transcribedClips.length} clip(s) transcribed</span>
        <span>
          {Math.ceil(
            transcribedClips.reduce(
              (sum, clip) => sum + (clip.duration || 0),
              0
            ) / 60
          )}{" "}
          min total
        </span>
      </div>
    </div>
  );
}
