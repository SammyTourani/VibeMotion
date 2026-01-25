/**
 * Timeline Component
 *
 * Visual timeline editor for the sandbox page.
 * Shows clips as horizontal blocks, allows drag-to-reorder and click-to-seek.
 */

"use client";

import React, { useMemo } from "react";
import { Reorder } from "framer-motion";
import { secondsToFrames, framesToSeconds } from "@/src/config";
import { Film, Image, Type, Play, Zap } from "lucide-react";

// Minimal scene interface - only what Timeline needs
interface TimelineScene {
  id: string;
  type: string;
  duration: number;
  order?: number;
  /** Optional silence percentage for visual indicator */
  silencePercentage?: number;
}

interface TimelineProps<T extends TimelineScene> {
  scenes: T[];
  currentFrame: number;
  totalDurationInFrames: number;
  onSeek: (frame: number) => void;
  onReorder: (newScenes: T[]) => void;
  className?: string;
}

// Scene type colors
const TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  "title": { bg: "bg-purple-500/30", border: "border-purple-500" },
  "a-roll": { bg: "bg-blue-500/30", border: "border-blue-500" },
  "b-roll": { bg: "bg-green-500/30", border: "border-green-500" },
  "transition": { bg: "bg-yellow-500/30", border: "border-yellow-500" },
  "cta": { bg: "bg-red-500/30", border: "border-red-500" },
  "content": { bg: "bg-cyan-500/30", border: "border-cyan-500" },
};

// Scene type icons
const TYPE_ICONS: Record<string, React.ElementType> = {
  "title": Type,
  "a-roll": Film,
  "b-roll": Image,
  "transition": Zap,
  "cta": Play,
  "content": Type,
};

export function Timeline<T extends TimelineScene>({
  scenes,
  currentFrame,
  totalDurationInFrames,
  onSeek,
  onReorder,
  className = "",
}: TimelineProps<T>) {
  // Calculate scene positions and widths
  const sceneData = useMemo(() => {
    let cumulativeFrames = 0;
    return scenes.map((scene) => {
      const startFrame = cumulativeFrames;
      const durationFrames = secondsToFrames(scene.duration);
      cumulativeFrames += durationFrames;
      const widthPercent = (durationFrames / totalDurationInFrames) * 100;
      return {
        scene,
        startFrame,
        durationFrames,
        widthPercent,
      };
    });
  }, [scenes, totalDurationInFrames]);

  // Calculate playhead position as percentage
  const playheadPercent = totalDurationInFrames > 0
    ? (currentFrame / totalDurationInFrames) * 100
    : 0;

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleClipClick = (startFrame: number) => {
    onSeek(startFrame);
  };

  if (scenes.length === 0) {
    return (
      <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-gray-500 text-sm text-center">
          No scenes to display
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* Time markers */}
      <div className="flex justify-between px-4 py-2 text-xs text-gray-500 border-b border-gray-800">
        <span>0:00</span>
        <span>Current: {formatTime(framesToSeconds(currentFrame))}</span>
        <span>{formatTime(framesToSeconds(totalDurationInFrames))}</span>
      </div>

      {/* Timeline track */}
      <div className="relative px-4 py-3">
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
          style={{
            left: `calc(${playheadPercent}% + 16px)`,
            transition: "left 0.05s linear",
          }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-500 rounded-full" />
        </div>

        {/* Reorderable clips */}
        <Reorder.Group
          axis="x"
          values={scenes}
          onReorder={onReorder}
          className="flex gap-1"
        >
          {sceneData.map(({ scene, startFrame, widthPercent }) => {
            const colors = TYPE_COLORS[scene.type] || TYPE_COLORS["content"];
            const Icon = TYPE_ICONS[scene.type] || Type;

            return (
              <Reorder.Item
                key={scene.id}
                value={scene}
                className={`
                  ${colors.bg} ${colors.border}
                  border-2 rounded-md cursor-pointer
                  hover:brightness-125 transition-all
                  flex flex-col justify-center items-center
                  min-w-[60px] px-2 py-2 relative
                `}
                style={{
                  flex: `0 0 ${Math.max(widthPercent, 5)}%`,
                }}
                onClick={() => handleClipClick(startFrame)}
                whileDrag={{ scale: 1.05, zIndex: 20 }}
              >
                {/* Silence indicator - orange dot for clips with >10% silence */}
                {scene.silencePercentage !== undefined && scene.silencePercentage > 10 && (
                  <div
                    className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"
                    title={`${scene.silencePercentage.toFixed(0)}% silence detected`}
                  />
                )}
                <Icon className="w-4 h-4 mb-1 opacity-70" />
                <span className="text-[10px] font-medium truncate max-w-full">
                  {scene.type}
                </span>
                <span className="text-[9px] text-gray-400">
                  {scene.duration.toFixed(1)}s
                </span>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 py-2 border-t border-gray-800 text-[10px]">
        {Object.entries(TYPE_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${colors.bg} ${colors.border} border`} />
            <span className="text-gray-400 capitalize">{type}</span>
          </div>
        ))}
        {/* Silence indicator legend */}
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-700">
          <div className="w-2 h-2 bg-orange-500 rounded-full" />
          <span className="text-gray-400">silence</span>
        </div>
      </div>
    </div>
  );
}

export default Timeline;
