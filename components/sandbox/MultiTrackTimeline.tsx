/**
 * MultiTrackTimeline Component
 *
 * A professional multi-track timeline editor with:
 * - Audio Track: Shows A-roll audio continuity
 * - Video Track: Main sequential scenes (title, a-roll, content, cta)
 * - Overlay Track: B-roll overlays positioned at correct times
 *
 * This architecture properly represents how B-roll overlays work:
 * B-roll is VISUAL ONLY - the A-roll AUDIO continues underneath.
 */

"use client";

import React, { useMemo, useCallback } from "react";
import { Reorder } from "framer-motion";
import { secondsToFrames, framesToSeconds } from "@/src/config";
import {
  Film,
  Image,
  Type,
  Play,
  Zap,
  Volume2,
  Layers,
  Video,
} from "lucide-react";

// Scene interface with overlay support
interface TimelineScene {
  id: string;
  type: string;
  duration: number;
  order?: number;
  compositionStartTime?: number;
  /** For b-roll-overlay: ID of the A-roll scene this overlays */
  overlayOnAroll?: string;
  /** For b-roll-overlay: When (in seconds) within the A-roll to show this overlay */
  overlayStartTime?: number;
  /** Optional silence percentage for visual indicator */
  silencePercentage?: number;
}

interface MultiTrackTimelineProps<T extends TimelineScene> {
  scenes: T[];
  currentFrame: number;
  totalDurationInFrames: number;
  fps?: number;
  onSeek: (frame: number) => void;
  onReorder: (newScenes: T[]) => void;
  className?: string;
}

// Scene type colors
const TYPE_COLORS: Record<string, { bg: string; border: string; solid: string }> = {
  title: { bg: "bg-purple-500/30", border: "border-purple-500", solid: "bg-purple-500" },
  "a-roll": { bg: "bg-blue-500/30", border: "border-blue-500", solid: "bg-blue-500" },
  "b-roll": { bg: "bg-green-500/30", border: "border-green-500", solid: "bg-green-500" },
  "b-roll-overlay": { bg: "bg-green-500/40", border: "border-green-400", solid: "bg-green-400" },
  video: { bg: "bg-blue-500/30", border: "border-blue-500", solid: "bg-blue-500" },
  transition: { bg: "bg-yellow-500/30", border: "border-yellow-500", solid: "bg-yellow-500" },
  cta: { bg: "bg-red-500/30", border: "border-red-500", solid: "bg-red-500" },
  content: { bg: "bg-cyan-500/30", border: "border-cyan-500", solid: "bg-cyan-500" },
};

// Scene type icons
const TYPE_ICONS: Record<string, React.ElementType> = {
  title: Type,
  "a-roll": Film,
  "b-roll": Image,
  "b-roll-overlay": Layers,
  video: Film,
  transition: Zap,
  cta: Play,
  content: Type,
};

export function MultiTrackTimeline<T extends TimelineScene>({
  scenes,
  currentFrame,
  totalDurationInFrames,
  fps = 60,
  onSeek,
  onReorder,
  className = "",
}: MultiTrackTimelineProps<T>) {
  // Separate scenes into sequential and overlays
  const { sequentialScenes, overlayScenes, aRollMap } = useMemo(() => {
    const sequential: T[] = [];
    const overlays: T[] = [];
    const aRollLookup = new Map<string, { startTime: number; duration: number }>();

    // First pass: identify sequential scenes and build A-roll map
    let cumulativeTime = 0;
    for (const scene of scenes) {
      if (scene.type === "b-roll-overlay" && scene.overlayOnAroll) {
        overlays.push(scene);
      } else {
        sequential.push(scene);
        if (scene.type === "a-roll" || scene.type === "video") {
          aRollLookup.set(scene.id, {
            startTime: cumulativeTime,
            duration: scene.duration,
          });
        }
        cumulativeTime += scene.duration;
      }
    }

    return {
      sequentialScenes: sequential,
      overlayScenes: overlays,
      aRollMap: aRollLookup,
    };
  }, [scenes]);

  // Calculate total duration in seconds from sequential scenes
  const totalDurationSeconds = useMemo(() => {
    return sequentialScenes.reduce((sum, s) => sum + s.duration, 0);
  }, [sequentialScenes]);

  // Calculate scene positions for video track
  const videoTrackData = useMemo(() => {
    let cumulativeTime = 0;
    return sequentialScenes.map((scene) => {
      const startTime = cumulativeTime;
      cumulativeTime += scene.duration;
      const leftPercent = totalDurationSeconds > 0 ? (startTime / totalDurationSeconds) * 100 : 0;
      const widthPercent = totalDurationSeconds > 0 ? (scene.duration / totalDurationSeconds) * 100 : 0;
      return {
        scene,
        startTime,
        leftPercent,
        widthPercent,
        startFrame: secondsToFrames(startTime, fps),
      };
    });
  }, [sequentialScenes, totalDurationSeconds, fps]);

  // Calculate audio regions (only A-roll has audio)
  const audioTrackData = useMemo(() => {
    return videoTrackData
      .filter(({ scene }) => scene.type === "a-roll" || scene.type === "video")
      .map(({ scene, startTime, leftPercent, widthPercent, startFrame }) => ({
        scene,
        startTime,
        leftPercent,
        widthPercent,
        startFrame,
      }));
  }, [videoTrackData]);

  // Calculate overlay positions based on parent A-roll
  const overlayTrackData = useMemo(() => {
    return overlayScenes.map((scene) => {
      const parent = aRollMap.get(scene.overlayOnAroll || "");
      if (!parent) {
        // Fallback: position based on order
        const index = overlayScenes.indexOf(scene);
        const fallbackStart = index * 3;
        return {
          scene,
          startTime: fallbackStart,
          leftPercent: totalDurationSeconds > 0 ? (fallbackStart / totalDurationSeconds) * 100 : 0,
          widthPercent: totalDurationSeconds > 0 ? (scene.duration / totalDurationSeconds) * 100 : 5,
          startFrame: secondsToFrames(fallbackStart, fps),
          parentId: null,
        };
      }

      const overlayStart = parent.startTime + (scene.overlayStartTime || 0);
      const leftPercent = totalDurationSeconds > 0 ? (overlayStart / totalDurationSeconds) * 100 : 0;
      const widthPercent = totalDurationSeconds > 0 ? (scene.duration / totalDurationSeconds) * 100 : 0;

      return {
        scene,
        startTime: overlayStart,
        leftPercent,
        widthPercent,
        startFrame: secondsToFrames(overlayStart, fps),
        parentId: scene.overlayOnAroll,
      };
    });
  }, [overlayScenes, aRollMap, totalDurationSeconds, fps]);

  // Calculate playhead position
  const playheadPercent = totalDurationInFrames > 0
    ? (currentFrame / totalDurationInFrames) * 100
    : 0;

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSeek = useCallback(
    (startFrame: number) => {
      onSeek(startFrame);
    },
    [onSeek]
  );

  // Handle click on track background for seeking
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = clickX / rect.width;
      const frame = Math.round(percent * totalDurationInFrames);
      onSeek(Math.max(0, Math.min(frame, totalDurationInFrames)));
    },
    [onSeek, totalDurationInFrames]
  );

  if (scenes.length === 0) {
    return (
      <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-gray-500 text-sm text-center">No scenes to display</div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* Time markers */}
      <div className="flex justify-between px-4 py-2 text-xs text-gray-500 border-b border-gray-800">
        <span>0:00</span>
        <span>Current: {formatTime(framesToSeconds(currentFrame, fps))}</span>
        <span>{formatTime(totalDurationSeconds)}</span>
      </div>

      {/* Track container */}
      <div className="relative px-4 py-2">
        {/* Playhead - spans all tracks */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
          style={{
            left: `calc(${playheadPercent}% + 16px - (${playheadPercent} * 0.32px))`,
            transition: "left 0.05s linear",
          }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow-lg" />
        </div>

        {/* TRACK 1: Overlay Track (B-roll overlays) */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-3 h-3 text-green-400" />
            <span className="text-[10px] text-green-400 font-medium">OVERLAY</span>
          </div>
          <div
            className="relative h-12 bg-gray-800/50 rounded border border-gray-700 cursor-crosshair"
            onClick={handleTrackClick}
          >
            {overlayTrackData.map(({ scene, leftPercent, widthPercent, startFrame, parentId }) => {
              const colors = TYPE_COLORS["b-roll-overlay"];
              return (
                <div
                  key={scene.id}
                  className={`
                    absolute top-1 bottom-1
                    ${colors.bg} ${colors.border} border-2
                    rounded cursor-pointer hover:brightness-125
                    flex items-center justify-center gap-1 px-1
                    transition-all shadow-lg
                  `}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${Math.max(widthPercent, 3)}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(startFrame);
                  }}
                  title={`B-roll overlay on ${parentId || "unknown"} at ${scene.overlayStartTime?.toFixed(1) || 0}s`}
                >
                  <Layers className="w-3 h-3 flex-shrink-0" />
                  <span className="text-[9px] truncate">{scene.duration.toFixed(1)}s</span>
                </div>
              );
            })}
            {overlayTrackData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-[10px]">
                No overlays
              </div>
            )}
          </div>
        </div>

        {/* TRACK 2: Video Track (Main sequence) */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1">
            <Video className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-blue-400 font-medium">VIDEO</span>
          </div>
          <div
            className="relative h-14 bg-gray-800/50 rounded border border-gray-700 cursor-crosshair"
            onClick={handleTrackClick}
          >
            <Reorder.Group
              axis="x"
              values={sequentialScenes}
              onReorder={onReorder}
              className="absolute inset-0 flex"
              style={{ padding: "4px" }}
            >
              {videoTrackData.map(({ scene, widthPercent, startFrame }) => {
                const colors = TYPE_COLORS[scene.type] || TYPE_COLORS.content;
                const Icon = TYPE_ICONS[scene.type] || Type;

                return (
                  <Reorder.Item
                    key={scene.id}
                    value={scene}
                    className={`
                      ${colors.bg} ${colors.border}
                      border-2 rounded cursor-pointer
                      hover:brightness-125 transition-all
                      flex flex-col justify-center items-center
                      min-w-[50px] relative
                    `}
                    style={{
                      flex: `0 0 ${Math.max(widthPercent, 4)}%`,
                      margin: "0 1px",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSeek(startFrame);
                    }}
                    whileDrag={{ scale: 1.02, zIndex: 20 }}
                  >
                    {scene.silencePercentage !== undefined && scene.silencePercentage > 10 && (
                      <div
                        className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"
                        title={`${scene.silencePercentage.toFixed(0)}% silence`}
                      />
                    )}
                    <Icon className="w-3 h-3 opacity-70" />
                    <span className="text-[9px] font-medium truncate max-w-full px-1">
                      {scene.type}
                    </span>
                    <span className="text-[8px] text-gray-400">{scene.duration.toFixed(1)}s</span>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>
        </div>

        {/* TRACK 3: Audio Track (A-roll audio only) */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Volume2 className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] text-cyan-400 font-medium">AUDIO</span>
          </div>
          <div
            className="relative h-10 bg-gray-800/50 rounded border border-gray-700 cursor-crosshair"
            onClick={handleTrackClick}
          >
            {/* Audio waveform visualization placeholder */}
            <div className="absolute inset-0 flex items-center">
              {audioTrackData.map(({ scene, leftPercent, widthPercent, startFrame }) => (
                <div
                  key={`audio-${scene.id}`}
                  className="absolute top-1 bottom-1 bg-cyan-500/30 border border-cyan-500/50 rounded cursor-pointer hover:bg-cyan-500/40"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${Math.max(widthPercent, 2)}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(startFrame);
                  }}
                  title={`Audio from ${scene.type}: ${scene.duration.toFixed(1)}s`}
                >
                  {/* Simple waveform bars */}
                  <div className="flex items-center justify-center h-full gap-[2px] px-1 overflow-hidden">
                    {Array.from({ length: Math.min(Math.floor(scene.duration * 3), 20) }).map((_, i) => (
                      <div
                        key={i}
                        className="w-[2px] bg-cyan-400/60 rounded-full"
                        style={{
                          height: `${20 + Math.random() * 60}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {audioTrackData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-[10px]">
                No audio
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 py-2 border-t border-gray-800 text-[10px]">
        {Object.entries(TYPE_COLORS)
          .filter(([type]) => !["b-roll"].includes(type))
          .map(([type, colors]) => (
            <div key={type} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${colors.bg} ${colors.border} border`} />
              <span className="text-gray-400 capitalize">{type.replace("-", " ")}</span>
            </div>
          ))}
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-700">
          <div className="w-2 h-2 bg-orange-500 rounded-full" />
          <span className="text-gray-400">silence</span>
        </div>
      </div>
    </div>
  );
}

export default MultiTrackTimeline;
