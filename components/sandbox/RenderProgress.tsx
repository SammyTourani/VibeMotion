/**
 * RenderProgress Component
 *
 * Visual progress indicator for video rendering.
 * Shows status, progress bar, and download link when complete.
 */

"use client";

import { motion } from "framer-motion";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  Film,
  X,
} from "lucide-react";

interface RenderProgressProps {
  status: "idle" | "pending" | "rendering" | "complete" | "error";
  progress: number;
  outputPath: string | null;
  error: string | null;
  onCancel?: () => void;
  className?: string;
}

export function RenderProgress({
  status,
  progress,
  outputPath,
  error,
  onCancel,
  className = "",
}: RenderProgressProps) {
  if (status === "idle") {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`rounded-xl border overflow-hidden ${
        status === "complete"
          ? "bg-green-500/10 border-green-500/30"
          : status === "error"
          ? "bg-red-500/10 border-red-500/30"
          : "bg-white/5 border-white/10"
      } ${className}`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {status === "complete" ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : status === "error" ? (
              <AlertCircle className="w-5 h-5 text-red-400" />
            ) : (
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            )}
            <span className="font-medium">
              {status === "complete"
                ? "Export Complete!"
                : status === "error"
                ? "Export Failed"
                : status === "pending"
                ? "Preparing to render..."
                : "Rendering video..."}
            </span>
          </div>

          {(status === "pending" || status === "rendering") && onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(status === "pending" || status === "rendering") && (
          <div className="mb-3">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-cyan-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(progress, 2)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-gray-500">
              <span>{status === "pending" ? "Initializing..." : "Encoding frames..."}</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {status === "error" && error && (
          <p className="text-sm text-red-400/80 mb-3">{error}</p>
        )}

        {/* Download section */}
        {status === "complete" && outputPath && (
          <div className="flex items-center gap-3">
            <a
              href={outputPath}
              download
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-400 text-black font-medium rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
              Download MP4
            </a>
            <a
              href={outputPath}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <Film className="w-5 h-5" />
              Preview
            </a>
          </div>
        )}
      </div>

      {/* Info footer */}
      {status === "complete" && outputPath && (
        <div className="px-4 py-2 bg-black/30 border-t border-white/5 text-xs text-gray-500">
          Saved to: {outputPath}
        </div>
      )}
    </motion.div>
  );
}

export default RenderProgress;
