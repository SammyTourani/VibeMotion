"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Video,
  Sparkles,
} from "lucide-react";
import type { PhaseData, PhaseStatus as PhaseStatusType } from "./ProgressBar";

interface PhaseStatusProps {
  phases: PhaseData[];
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
  startTime?: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function getStatusBadge(status: PhaseStatusType) {
  switch (status) {
    case "complete":
      return (
        <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
          Complete
        </span>
      );
    case "running":
      return (
        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium animate-pulse">
          Running
        </span>
      );
    case "error":
      return (
        <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
          Error
        </span>
      );
    case "skipped":
      return (
        <span className="px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 text-xs font-medium">
          Skipped
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-500 text-xs font-medium">
          Pending
        </span>
      );
  }
}

export default function PhaseStatus({
  phases,
  transcripts,
  classification,
  storyboard,
  startTime,
}: PhaseStatusProps) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const completedPhases = phases.filter((p) => p.status === "complete");
  const currentPhase = phases.find((p) => p.status === "running");
  const hasDetails = transcripts || classification || storyboard;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <div className="text-xs text-gray-500 mb-1">Progress</div>
          <div className="text-xl font-bold text-white">
            {completedPhases.length}/{phases.length}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-gray-500 mb-1">Current</div>
          <div className="text-xl font-bold text-purple-400 capitalize">
            {currentPhase?.name || "Done"}
          </div>
        </div>
        {startTime && (
          <div className="card p-3">
            <div className="text-xs text-gray-500 mb-1">Elapsed</div>
            <div className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              {formatDuration(Date.now() - startTime)}
            </div>
          </div>
        )}
        {storyboard && (
          <div className="card p-3">
            <div className="text-xs text-gray-500 mb-1">Duration</div>
            <div className="text-xl font-bold text-cyan-400">
              {storyboard.totalDuration.toFixed(1)}s
            </div>
          </div>
        )}
      </div>

      {/* Expandable Details */}
      {hasDetails && (
        <div className="space-y-2">
          {/* Transcripts */}
          {transcripts && transcripts.length > 0 && (
            <div className="card overflow-hidden">
              <button
                onClick={() =>
                  setExpandedPhase(expandedPhase === "transcripts" ? null : "transcripts")
                }
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-purple-400" />
                  <div className="text-left">
                    <div className="font-medium text-white">Transcriptions</div>
                    <div className="text-xs text-gray-500">
                      {transcripts.length} videos transcribed
                    </div>
                  </div>
                </div>
                {expandedPhase === "transcripts" ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              <AnimatePresence>
                {expandedPhase === "transcripts" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-800"
                  >
                    <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
                      {transcripts.map((t) => (
                        <div key={t.assetId} className="p-3 bg-black/30 rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-300">
                              {t.publicPath.split("/").pop()}
                            </span>
                            <span className="text-xs text-gray-500">
                              {t.wordCount} words · {t.duration.toFixed(1)}s
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-2">
                            {t.text || "No speech detected"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Classification */}
          {classification && (
            <div className="card overflow-hidden">
              <button
                onClick={() =>
                  setExpandedPhase(expandedPhase === "classification" ? null : "classification")
                }
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Video className="w-5 h-5 text-cyan-400" />
                  <div className="text-left">
                    <div className="font-medium text-white">Classification</div>
                    <div className="text-xs text-gray-500">
                      {classification.summary.aRollCount} A-roll · {classification.summary.bRollCount} B-roll
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    classification.summary.narrativeStrength === "strong"
                      ? "bg-green-500/20 text-green-400"
                      : classification.summary.narrativeStrength === "moderate"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-orange-500/20 text-orange-400"
                  }`}>
                    {classification.summary.narrativeStrength} narrative
                  </span>
                  {expandedPhase === "classification" ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>
              <AnimatePresence>
                {expandedPhase === "classification" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-800"
                  >
                    <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                      {classification.clips.map((clip) => (
                        <div
                          key={clip.name}
                          className="flex items-center justify-between p-2 bg-black/30 rounded-lg"
                        >
                          <span className="text-sm text-gray-300">{clip.name}</span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                clip.role === "A-roll"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : "bg-cyan-500/20 text-cyan-400"
                              }`}
                            >
                              {clip.role}
                            </span>
                            <span className="text-xs text-gray-500">
                              {(clip.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Storyboard */}
          {storyboard && (
            <div className="card overflow-hidden">
              <button
                onClick={() =>
                  setExpandedPhase(expandedPhase === "storyboard" ? null : "storyboard")
                }
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <div className="text-left">
                    <div className="font-medium text-white">Storyboard</div>
                    <div className="text-xs text-gray-500">
                      {storyboard.scenes.length} scenes · {storyboard.totalDuration.toFixed(1)}s total
                    </div>
                  </div>
                </div>
                {expandedPhase === "storyboard" ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              <AnimatePresence>
                {expandedPhase === "storyboard" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-800"
                  >
                    <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
                      <p className="text-sm text-gray-300 mb-4">{storyboard.summary}</p>
                      {storyboard.scenes.map((scene, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-2 bg-black/30 rounded-lg"
                        >
                          <span className="text-xs font-mono text-gray-500 mt-0.5">
                            {(i + 1).toString().padStart(2, "0")}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  scene.type === "a-roll"
                                    ? "bg-purple-500/20 text-purple-400"
                                    : scene.type === "b-roll"
                                    ? "bg-cyan-500/20 text-cyan-400"
                                    : scene.type === "title"
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "bg-gray-500/20 text-gray-400"
                                }`}
                              >
                                {scene.type}
                              </span>
                              <span className="text-xs text-gray-500">
                                {scene.duration.toFixed(1)}s
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">{scene.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Phase List with Status Badges */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Phase Status</h3>
        <div className="space-y-2">
          {phases.map((phase) => (
            <div
              key={phase.name}
              className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
            >
              <span className="text-sm text-gray-300 capitalize">{phase.name}</span>
              <div className="flex items-center gap-2">
                {phase.message && phase.status === "running" && (
                  <span className="text-xs text-gray-500 max-w-[150px] truncate">
                    {phase.message}
                  </span>
                )}
                {getStatusBadge(phase.status)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
