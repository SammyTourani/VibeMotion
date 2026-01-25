/**
 * RemotionPreview Component
 *
 * A Next.js-compatible wrapper for the Remotion Player that displays
 * a live preview of the generated storyboard using the DynamicPreview composition.
 *
 * This component must be dynamically imported with { ssr: false } in Next.js
 * to avoid server-side rendering issues with Remotion.
 */

"use client";

import React, { useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Player, PlayerRef, RenderLoading } from "@remotion/player";
import { AbsoluteFill } from "remotion";
import {
  DynamicPreview,
  type Scene,
  type DynamicPreviewTheme,
} from "@/src/compositions/dynamic-preview";

// Music recommendation from smart storyboard
export interface MusicRecommendation {
  mood: string;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  reasoning?: string;
}

// Storyboard structure from generate-stream API
export interface Storyboard {
  scenes: Scene[];
  totalDuration: number;
  summary: string;
  /** Optional background music configuration */
  music?: MusicRecommendation;
}

/**
 * Map music mood to actual audio file path
 * Returns null to disable music - the music files don't exist yet.
 *
 * TODO: When adding music support:
 * 1. Add music files to public/assets/audio/ (music-upbeat.mp3, music-chill.mp3, etc.)
 * 2. Uncomment the musicMap below
 * 3. Return musicMap[mood] || musicMap.chill
 */
function getMusicSrcForMood(mood: string): string | null {
  // DISABLED: Music files don't exist, causing 404 errors every frame
  // This was the root cause of playback jitter
  return null;

  // When music files are added, use this:
  // const musicMap: Record<string, string> = {
  //   upbeat: "assets/audio/music-upbeat.mp3",
  //   chill: "assets/audio/music-chill.mp3",
  //   dramatic: "assets/audio/music-dramatic.mp3",
  //   energetic: "assets/audio/music-energetic.mp3",
  //   corporate: "assets/audio/music-corporate.mp3",
  // };
  // return musicMap[mood] || musicMap.chill;
}

// Aspect ratio dimensions
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export interface RemotionPreviewProps {
  storyboard: Storyboard;
  isPlaying: boolean;
  onPlayChange?: (playing: boolean) => void;
  onFrameChange?: (frame: number) => void;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:5";
  theme?: Partial<DynamicPreviewTheme>;
  showControls?: boolean;
  loop?: boolean;
  className?: string;
}

// Handle type for exposing methods via ref
export interface RemotionPreviewHandle {
  seekTo: (frame: number) => void;
}

// Default theme matching the sandbox style
const DEFAULT_THEME: DynamicPreviewTheme = {
  primaryColor: "#8B5CF6",
  secondaryColor: "#7C3AED",
  backgroundColor: "#000000",
  textColor: "#FFFFFF",
  style: "modern",
};

export const RemotionPreview = forwardRef<RemotionPreviewHandle, RemotionPreviewProps>(
  function RemotionPreview({
    storyboard,
    isPlaying,
    onPlayChange,
    onFrameChange,
    aspectRatio = "9:16",
    theme = {},
    showControls = true,
    loop = true,
    className,
  }, ref) {
  const playerRef = useRef<PlayerRef>(null);
  // Track if the play/pause was triggered externally to prevent feedback loops
  const isExternalPlayChangeRef = useRef(false);

  // Expose seekTo method to parent via ref
  useImperativeHandle(ref, () => ({
    seekTo: (frame: number) => {
      playerRef.current?.seekTo(frame);
    },
  }));
  const dimensions = DIMENSIONS[aspectRatio] || DIMENSIONS["9:16"];
  const fps = 60;

  // Calculate total duration in frames
  // IMPORTANT: Exclude B-roll overlays - they play DURING A-roll, not after
  // Only sequential scenes contribute to total duration
  const calculatedDuration = useMemo(() => {
    return storyboard.scenes
      .filter(scene => !(scene.type === "b-roll-overlay" && scene.overlayOnAroll))
      .reduce((sum, scene) => sum + (scene.duration || 1), 0);
  }, [storyboard.scenes]);

  const durationInFrames = Math.max(
    1,
    Math.ceil((storyboard.totalDuration || calculatedDuration) * fps)
  );

  // Merge theme with defaults
  const mergedTheme: DynamicPreviewTheme = useMemo(
    () => ({
      ...DEFAULT_THEME,
      ...theme,
    }),
    [theme]
  );

  // Build music configuration if present in storyboard
  const musicConfig = useMemo(() => {
    if (!storyboard.music || storyboard.music.mood === "none") {
      return undefined;
    }

    const src = getMusicSrcForMood(storyboard.music.mood);
    if (!src) return undefined;

    return {
      src,
      volume: storyboard.music.volume,
      fadeInSeconds: storyboard.music.fadeInSeconds,
      fadeOutSeconds: storyboard.music.fadeOutSeconds,
      loop: true,
    };
  }, [storyboard.music]);

  // Input props for the DynamicPreview composition
  const inputProps = useMemo(
    () => ({
      scenes: storyboard.scenes,
      totalDuration: storyboard.totalDuration || calculatedDuration,
      theme: mergedTheme,
      music: musicConfig,
    }),
    [storyboard.scenes, storyboard.totalDuration, calculatedDuration, mergedTheme, musicConfig]
  );

  // Loading state renderer
  const renderLoading: RenderLoading = useCallback(
    ({ height, width }) => {
      return (
        <AbsoluteFill
          style={{
            backgroundColor: mergedTheme.backgroundColor,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: `3px solid ${mergedTheme.primaryColor}`,
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <div style={{ color: "#666", fontSize: 14 }}>
              Loading preview ({width}x{height})
            </div>
          </div>
          <style>
            {`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}
          </style>
        </AbsoluteFill>
      );
    },
    [mergedTheme]
  );

  // Error fallback renderer
  const errorFallback = useCallback(
    ({ error }: { error: Error }) => {
      return (
        <AbsoluteFill
          style={{
            backgroundColor: mergedTheme.backgroundColor,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 30 }}>!</span>
            </div>
            <div style={{ color: "#ef4444", fontSize: 16, fontWeight: 600 }}>
              Preview Error
            </div>
            <div style={{ color: "#888", fontSize: 13, maxWidth: 300 }}>
              {error.message}
            </div>
          </div>
        </AbsoluteFill>
      );
    },
    [mergedTheme]
  );

  // Sync play state with external control
  // Uses ref to track if change is external and prevent feedback loops
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // Mark that this is an external change
    isExternalPlayChangeRef.current = true;

    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }

    // Reset flag after a short delay to allow the player event to fire
    const timer = setTimeout(() => {
      isExternalPlayChangeRef.current = false;
    }, 50);

    return () => clearTimeout(timer);
  }, [isPlaying]);

  // Handle play state changes from the player (user clicking controls)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onPlayChange) return;

    const handlePlay = () => {
      // Only propagate if not triggered by our external control
      if (!isExternalPlayChangeRef.current) {
        onPlayChange(true);
      }
    };

    const handlePause = () => {
      // Only propagate if not triggered by our external control
      if (!isExternalPlayChangeRef.current) {
        onPlayChange(false);
      }
    };

    const handleEnded = () => {
      if (!loop) {
        onPlayChange(false);
      }
    };

    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    player.addEventListener("ended", handleEnded);

    return () => {
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("ended", handleEnded);
    };
  }, [onPlayChange, loop]);

  // Handle frame changes with throttling to prevent jitter
  // Only report frame changes every 3 frames (~50ms at 60fps) to reduce
  // React re-render overhead that causes playback to lag behind
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onFrameChange) return;

    let lastReportedFrame = -1;
    let rafId: number | null = null;

    const handleFrameUpdate = () => {
      // Skip if we already have a pending RAF
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        const frame = player.getCurrentFrame();
        // Only report if frame changed by at least 3 frames (reduces render frequency)
        if (Math.abs(frame - lastReportedFrame) >= 3) {
          lastReportedFrame = frame;
          onFrameChange(frame);
        }
        rafId = null;
      });
    };

    player.addEventListener("frameupdate", handleFrameUpdate);

    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [onFrameChange]);

  // Validate storyboard has scenes
  if (!storyboard.scenes || storyboard.scenes.length === 0) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: mergedTheme.backgroundColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "#666", fontSize: 14, textAlign: "center" }}>
          <div style={{ marginBottom: 8 }}>No scenes to preview</div>
          <div style={{ fontSize: 12, color: "#444" }}>
            Generate a storyboard first
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Player
        ref={playerRef}
        component={DynamicPreview}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={dimensions.width}
        compositionHeight={dimensions.height}
        style={{
          width: "100%",
          height: "100%",
        }}
        controls={showControls}
        loop={loop}
        autoPlay={false}
        clickToPlay
        doubleClickToFullscreen
        spaceKeyToPlayOrPause
        moveToBeginningWhenEnded={!loop}
        renderLoading={renderLoading}
        errorFallback={errorFallback}
      />
    </div>
  );
});

export default RemotionPreview;
