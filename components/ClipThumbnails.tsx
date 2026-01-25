"use client";

import type { VideoClip } from "@/lib/types";
import { formatFileSize, formatDuration } from "@/lib/video-utils";

interface ClipThumbnailsProps {
  clips: VideoClip[];
  onRemove: (id: string) => void;
}

export default function ClipThumbnails({
  clips,
  onRemove,
}: ClipThumbnailsProps) {
  if (clips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          Uploaded Clips ({clips.length})
        </h3>
        <button
          onClick={() => {
            if (confirm("Clear all clips?")) {
              clips.forEach((clip) => onRemove(clip.id));
            }
          }}
          className="text-xs text-red-600 hover:text-red-700 font-medium"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-2">
        {clips.map((clip, index) => (
          <div
            key={clip.id}
            className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-400 transition-colors group"
          >
            {/* Thumbnail */}
            <div className="flex-shrink-0 relative">
              {clip.thumbnail ? (
                <img
                  src={clip.thumbnail}
                  alt={clip.name}
                  className="w-20 h-14 object-cover rounded bg-gray-900"
                />
              ) : (
                <div className="w-20 h-14 bg-gray-200 rounded flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
              {/* Clip number badge */}
              <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {index + 1}
              </div>
            </div>

            {/* Clip info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate flex-1">
                  {clip.name}
                </p>
                {/* Transcription status badge */}
                {clip.transcriptStatus === "complete" && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                    ✓ Transcribed
                  </span>
                )}
                {clip.transcriptStatus === "processing" && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                    ⏳ Processing...
                  </span>
                )}
                {clip.transcriptStatus === "error" && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                    ✗ Error
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {clip.duration !== null && (
                  <span className="text-xs text-gray-600">
                    {formatDuration(clip.duration)}
                  </span>
                )}
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-600">
                  {formatFileSize(clip.size)}
                </span>
              </div>
            </div>

            {/* Remove button */}
            <button
              onClick={() => onRemove(clip.id)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600"
              aria-label="Remove clip"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Total duration */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Total duration:</span>
          <span className="font-medium text-gray-900">
            {formatDuration(
              clips.reduce((sum, clip) => sum + (clip.duration || 0), 0)
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
