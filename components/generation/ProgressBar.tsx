"use client";

import { motion } from "framer-motion";
import {
  Upload,
  FileAudio,
  Tags,
  LayoutList,
  Code,
  Film,
  Check,
  Loader2,
  AlertCircle,
  SkipForward,
} from "lucide-react";

export type PhaseStatus = "pending" | "running" | "complete" | "error" | "skipped";

export interface PhaseData {
  name: string;
  status: PhaseStatus;
  progress: number;
  message?: string;
}

interface ProgressBarProps {
  phases: PhaseData[];
  currentPhase?: string;
}

const PHASE_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; description: string }
> = {
  upload: {
    icon: Upload,
    label: "Upload",
    description: "Processing files",
  },
  transcribe: {
    icon: FileAudio,
    label: "Transcribe",
    description: "Extracting audio & analyzing visuals",
  },
  classify: {
    icon: Tags,
    label: "Classify",
    description: "Identifying A-roll & B-roll",
  },
  storyboard: {
    icon: LayoutList,
    label: "Storyboard",
    description: "Planning scene arrangement",
  },
  composition: {
    icon: Code,
    label: "Compose",
    description: "Generating video code",
  },
  render: {
    icon: Film,
    label: "Render",
    description: "Creating final video",
  },
};

function getStatusIcon(status: PhaseStatus) {
  switch (status) {
    case "complete":
      return <Check className="w-4 h-4 text-white" />;
    case "running":
      return <Loader2 className="w-4 h-4 text-white animate-spin" />;
    case "error":
      return <AlertCircle className="w-4 h-4 text-white" />;
    case "skipped":
      return <SkipForward className="w-4 h-4 text-gray-400" />;
    default:
      return null;
  }
}

function getStatusStyles(status: PhaseStatus, isCurrent: boolean) {
  const base = "transition-all duration-300";

  switch (status) {
    case "complete":
      return {
        circle: `${base} bg-gradient-to-br from-green-500 to-emerald-600 border-green-500`,
        text: "text-white",
        line: "bg-gradient-to-r from-green-500 to-green-500",
        glow: "shadow-lg shadow-green-500/30",
      };
    case "running":
      return {
        circle: `${base} bg-gradient-to-br from-purple-500 to-violet-600 border-purple-500`,
        text: "text-white",
        line: "bg-gradient-to-r from-purple-500 to-gray-600",
        glow: "shadow-lg shadow-purple-500/50 animate-pulse",
      };
    case "error":
      return {
        circle: `${base} bg-gradient-to-br from-red-500 to-rose-600 border-red-500`,
        text: "text-white",
        line: "bg-red-500",
        glow: "shadow-lg shadow-red-500/30",
      };
    case "skipped":
      return {
        circle: `${base} bg-gray-700 border-gray-600`,
        text: "text-gray-400",
        line: "bg-gray-600",
        glow: "",
      };
    default: // pending
      return {
        circle: `${base} bg-gray-800 border-gray-600`,
        text: isCurrent ? "text-gray-300" : "text-gray-500",
        line: "bg-gray-700",
        glow: "",
      };
  }
}

export default function ProgressBar({ phases, currentPhase }: ProgressBarProps) {
  return (
    <div className="w-full">
      {/* Desktop Layout */}
      <div className="hidden md:flex items-center justify-between relative">
        {phases.map((phase, index) => {
          const config = PHASE_CONFIG[phase.name];
          if (!config) return null;

          const Icon = config.icon;
          const isCurrent = phase.name === currentPhase;
          const styles = getStatusStyles(phase.status, isCurrent);
          const isLast = index === phases.length - 1;

          return (
            <div key={phase.name} className="flex items-center flex-1">
              {/* Phase Circle */}
              <div className="relative flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative w-14 h-14 rounded-full border-2 flex items-center justify-center ${styles.circle} ${styles.glow}`}
                >
                  {phase.status === "pending" ? (
                    <Icon className={`w-6 h-6 ${styles.text}`} />
                  ) : (
                    getStatusIcon(phase.status) || <Icon className={`w-6 h-6 ${styles.text}`} />
                  )}
                </motion.div>

                {/* Label */}
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 + 0.1 }}
                  className="mt-3 text-center"
                >
                  <div className={`text-sm font-medium ${styles.text}`}>{config.label}</div>
                  {phase.status === "running" && phase.message && (
                    <div className="text-xs text-gray-400 max-w-[100px] truncate mt-1">
                      {phase.message}
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Connecting Line */}
              {!isLast && (
                <div className="flex-1 h-1 mx-2 rounded-full bg-gray-700 overflow-hidden">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{
                      width:
                        phase.status === "complete"
                          ? "100%"
                          : phase.status === "running"
                          ? `${phase.progress}%`
                          : "0%",
                    }}
                    transition={{ duration: 0.5 }}
                    className={`h-full rounded-full ${styles.line}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile Layout - Vertical */}
      <div className="md:hidden space-y-4">
        {phases.map((phase, index) => {
          const config = PHASE_CONFIG[phase.name];
          if (!config) return null;

          const Icon = config.icon;
          const isCurrent = phase.name === currentPhase;
          const styles = getStatusStyles(phase.status, isCurrent);
          const isLast = index === phases.length - 1;

          return (
            <div key={phase.name}>
              <div className="flex items-center gap-4">
                {/* Circle */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${styles.circle} ${styles.glow}`}
                >
                  {phase.status === "pending" ? (
                    <Icon className={`w-5 h-5 ${styles.text}`} />
                  ) : (
                    getStatusIcon(phase.status) || <Icon className={`w-5 h-5 ${styles.text}`} />
                  )}
                </motion.div>

                {/* Info */}
                <div className="flex-1">
                  <div className={`font-medium ${styles.text}`}>{config.label}</div>
                  <div className="text-xs text-gray-500">{config.description}</div>
                  {phase.status === "running" && (
                    <div className="mt-2">
                      <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${phase.progress}%` }}
                          className="h-full bg-purple-500 rounded-full"
                        />
                      </div>
                      {phase.message && (
                        <div className="text-xs text-gray-400 mt-1">{phase.message}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Vertical Line */}
              {!isLast && (
                <div className="ml-6 h-4 w-0.5 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ height: "0%" }}
                    animate={{
                      height: phase.status === "complete" ? "100%" : "0%",
                    }}
                    className="w-full bg-green-500 rounded-full"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
