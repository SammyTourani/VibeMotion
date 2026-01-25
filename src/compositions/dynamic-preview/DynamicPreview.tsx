/**
 * DynamicPreview Composition
 *
 * A data-driven Remotion composition that renders storyboard scenes.
 * Used by the Remotion Player in the sandbox for live preview.
 *
 * ARCHITECTURE:
 * - Audio Layer: Continuous A-roll audio that plays through B-roll scenes
 * - Video Layer: All visual scenes (title, a-roll, b-roll, etc.)
 * - Caption Layer: TikTok-style animated subtitles on top
 *
 * PERFORMANCE:
 * - Uses OffthreadVideo for off-threaded video decoding
 * - No fade animations on video scenes (hard cuts for smooth playback)
 * - Prefetches video assets before playback
 */

import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  Img,
  OffthreadVideo,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  prefetch,
} from "remotion";
import { ContentSlide } from "../../components/ContentSlide";
import { Music } from "../../components/Music";
import {
  segmentTranscript,
  type CaptionSegment,
  type TranscriptWord as SegmentTranscriptWord,
} from "../../utils/segmentTranscript";

// Word-level transcript for captions
export interface TranscriptWord {
  text: string;
  start: number; // seconds (composition timeline)
  end: number;   // seconds
}

// Scene definition matching the storyboard structure from pipeline
export interface Scene {
  id: string;
  type: "title" | "content" | "image" | "video" | "transition" | "a-roll" | "b-roll" | "b-roll-overlay" | "cta" | string;
  duration: number;
  description: string;
  text?: string;
  /** Single asset path (used by pipeline for a-roll/b-roll) */
  asset?: string;
  /** Array of asset paths (legacy) */
  assets?: string[];
  /** Start time in the source video (for trimming) */
  assetStartTime?: number;
  /** Start time in the composition timeline */
  compositionStartTime?: number;
  voiceover?: string;
  voiceoverAudio?: string;
  animation?: "fade-in" | "slide-up" | "zoom-in" | "pop" | "none" | string;
  order?: number;
  /** Word-level timestamps for captions */
  words?: TranscriptWord[];
  /** For b-roll-overlay: ID of the A-roll scene this overlays */
  overlayOnAroll?: string;
  /** For b-roll-overlay: When (in seconds) within the A-roll to show this overlay */
  overlayStartTime?: number;
}

export interface DynamicPreviewTheme {
  primaryColor: string;
  secondaryColor?: string;
  backgroundColor: string;
  textColor: string;
  style?: string;
}

export interface DynamicPreviewProps {
  scenes?: Scene[];
  totalDuration?: number;
  theme?: DynamicPreviewTheme;
  /** Background music configuration */
  music?: {
    src: string;
    volume: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
    loop?: boolean;
  };
}

const DEFAULT_THEME: DynamicPreviewTheme = {
  primaryColor: "#8B5CF6",
  secondaryColor: "#7C3AED",
  backgroundColor: "#000000",
  textColor: "#FFFFFF",
  style: "modern",
};

const DEFAULT_SCENES: Scene[] = [];

/**
 * TikTok-style animated captions with semantic phrase grouping
 * Shows the current segment with word-by-word highlighting
 * Uses constrained layout to prevent text overlapping
 */
const TikTokCaption: React.FC<{
  segments: CaptionSegment[];
  accentColor: string;
}> = ({ segments, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const currentTime = frame / fps;

  // Find current segment (semantic phrase group)
  const currentSegment = segments.find(
    seg => currentTime >= seg.startTime && currentTime < seg.endTime
  );

  if (!currentSegment) {
    return null;
  }

  const wordCount = currentSegment.words.length;
  const totalChars = currentSegment.words.reduce((sum, w) => sum + w.text.length, 0);

  // Responsive font sizing based on composition width and content
  // Base size relative to composition width for consistent look across aspect ratios
  const baseSize = Math.round(width * 0.038); // 3.8% of width (slightly smaller base)

  // Scale down more aggressively for longer content to prevent cutoff
  let fontSize = baseSize;
  if (wordCount > 4 || totalChars > 25) fontSize = Math.round(baseSize * 0.9);
  if (wordCount > 6 || totalChars > 40) fontSize = Math.round(baseSize * 0.8);
  if (wordCount > 8 || totalChars > 55) fontSize = Math.round(baseSize * 0.7);

  // Minimum readable size
  fontSize = Math.max(fontSize, 26);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 100,
        paddingLeft: 20,
        paddingRight: 20,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.85)",
          padding: "16px 28px",
          borderRadius: 14,
          maxWidth: "95%",
          width: "auto",
          // Use flexbox for proper word wrapping
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "8px 12px",
          lineHeight: 1.4,
          overflow: "visible",
          boxSizing: "border-box",
        }}
      >
        {currentSegment.words.map((word, i) => {
          const isActive = currentTime >= word.start && currentTime < word.end;

          // Subtle spring animation for active word
          const wordFrame = isActive ? frame - Math.round(word.start * fps) : 0;
          const wordScale = isActive
            ? spring({
                frame: wordFrame,
                fps,
                config: { damping: 20, stiffness: 300 },
                durationInFrames: 8,
              })
            : 0;

          return (
            <span
              key={`${word.start}-${i}`}
              style={{
                fontSize,
                fontWeight: 700,
                color: isActive ? accentColor : "white",
                transform: `scale(${1 + wordScale * 0.1})`,
                display: "inline-block",
                textShadow: isActive
                  ? `0 0 20px ${accentColor}`
                  : "0 1px 3px rgba(0,0,0,0.5)",
                transition: "color 0.08s ease",
                whiteSpace: "nowrap",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Animated title slide with gradient background and spring animation
 */
const AnimatedTitleSlide: React.FC<{
  title: string;
  theme: DynamicPreviewTheme;
  animation?: string;
}> = ({ title, theme, animation = "pop" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animated gradient background
  const gradientProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  const gradientAngle = 135 + gradientProgress * 30;

  // Spring entrance animation
  const entranceProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
    durationInFrames: 30,
  });

  // Exit fade (last 0.5 seconds)
  const exitFade = interpolate(
    frame,
    [durationInFrames - fps * 0.5, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Animation style based on type
  let transformStyle: React.CSSProperties = {};
  switch (animation) {
    case "pop":
      transformStyle = {
        transform: `scale(${0.5 + entranceProgress * 0.5})`,
        opacity: entranceProgress * exitFade,
      };
      break;
    case "slide-up":
      transformStyle = {
        transform: `translateY(${(1 - entranceProgress) * 50}px)`,
        opacity: entranceProgress * exitFade,
      };
      break;
    case "zoom-in":
      transformStyle = {
        transform: `scale(${0.9 + entranceProgress * 0.1})`,
        opacity: entranceProgress * exitFade,
      };
      break;
    default:
      transformStyle = {
        opacity: entranceProgress * exitFade,
      };
  }

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientAngle}deg, ${theme.backgroundColor} 0%, ${theme.primaryColor}40 50%, ${theme.backgroundColor} 100%)`,
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      <div
        style={{
          color: theme.textColor,
          fontSize: 72,
          fontWeight: "bold",
          textAlign: "center",
          textShadow: `0 0 60px ${theme.primaryColor}, 0 4px 20px rgba(0,0,0,0.5)`,
          lineHeight: 1.2,
          ...transformStyle,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Video scene renderer - NO fade animations for smooth playback
 * Uses OffthreadVideo for performance with pauseWhenBuffering to prevent flashes
 */
const VideoSceneRenderer: React.FC<{
  scene: Scene;
  theme: DynamicPreviewTheme;
  videoPath: string;
}> = ({ scene, theme, videoPath }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <OffthreadVideo
        src={staticFile(videoPath)}
        startFrom={Math.round((scene.assetStartTime || 0) * fps)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          // Ensure video shows black background while loading, not white
          backgroundColor: "#000",
        }}
        // Note: Audio is handled in the separate audio layer
        muted
        // Pause playback while video loads to prevent black flashes
        // This will become the default in Remotion 5.0
        pauseWhenBuffering
        // Handle errors gracefully
        onError={(err) => {
          console.error(`[DynamicPreview] Video error for ${videoPath}:`, err);
        }}
      />
      {/* Text overlay if present */}
      {scene.text && (
        <AbsoluteFill
          style={{
            background: "linear-gradient(transparent 60%, rgba(0,0,0,0.8))",
            justifyContent: "flex-end",
            padding: 40,
          }}
        >
          <div
            style={{
              color: theme.textColor,
              fontSize: 48,
              fontWeight: "bold",
              textShadow: "0 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            {scene.text}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/**
 * Render a single scene based on its type
 * Video scenes use hard cuts (no fade animations)
 * Title/CTA scenes use spring animations
 */
const SceneRenderer: React.FC<{
  scene: Scene;
  theme: DynamicPreviewTheme;
}> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Helper to get video path
  const getVideoPath = (): string | null => {
    if (scene.asset) {
      return scene.asset.startsWith("assets/")
        ? scene.asset
        : `assets/videos/${scene.asset}`;
    }
    if (scene.assets?.[0]) {
      return scene.assets[0].startsWith("assets/")
        ? scene.assets[0]
        : `assets/videos/${scene.assets[0]}`;
    }
    return null;
  };

  // Helper to get image path
  const getImagePath = (): string | null => {
    if (scene.asset) {
      return scene.asset.startsWith("assets/")
        ? scene.asset
        : `assets/images/${scene.asset}`;
    }
    if (scene.assets?.[0]) {
      return scene.assets[0].startsWith("assets/")
        ? scene.assets[0]
        : `assets/images/${scene.assets[0]}`;
    }
    return null;
  };

  switch (scene.type) {
    case "title":
      return (
        <AnimatedTitleSlide
          title={scene.text || scene.description}
          theme={theme}
          animation={scene.animation}
        />
      );

    case "cta":
      return (
        <AnimatedTitleSlide
          title={scene.text || scene.description}
          theme={theme}
          animation={scene.animation || "pop"}
        />
      );

    case "content":
      return (
        <AbsoluteFill>
          <ContentSlide
            header={scene.text || ""}
            content={scene.description}
            className="bg-transparent"
          />
          <AbsoluteFill
            style={{
              backgroundColor: theme.backgroundColor,
              zIndex: -1,
            }}
          />
        </AbsoluteFill>
      );

    case "image": {
      const imagePath = getImagePath();
      if (imagePath) {
        return (
          <AbsoluteFill>
            <Img
              src={staticFile(imagePath)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            {scene.text && (
              <AbsoluteFill
                style={{
                  background: "linear-gradient(transparent 60%, rgba(0,0,0,0.8))",
                  justifyContent: "flex-end",
                  padding: 40,
                }}
              >
                <div
                  style={{
                    color: theme.textColor,
                    fontSize: 48,
                    fontWeight: "bold",
                    textShadow: "0 2px 10px rgba(0,0,0,0.5)",
                  }}
                >
                  {scene.text}
                </div>
              </AbsoluteFill>
            )}
          </AbsoluteFill>
        );
      }
      return (
        <AbsoluteFill style={{ backgroundColor: theme.backgroundColor }}>
          <ContentSlide
            header="Image"
            content={scene.description}
            className="bg-transparent"
          />
        </AbsoluteFill>
      );
    }

    case "video":
    case "a-roll":
    case "b-roll":
    case "b-roll-overlay": {
      // All video types rendered the same way - audio handled separately
      const videoPath = getVideoPath();
      if (videoPath) {
        return <VideoSceneRenderer scene={scene} theme={theme} videoPath={videoPath} />;
      }
      return (
        <AbsoluteFill style={{ backgroundColor: theme.backgroundColor }}>
          <ContentSlide
            header={scene.type === "b-roll" || scene.type === "b-roll-overlay" ? "B-Roll" : "Video"}
            content={scene.description}
            className="bg-transparent"
          />
        </AbsoluteFill>
      );
    }

    case "transition":
      return (
        <AbsoluteFill
          style={{
            backgroundColor: theme.backgroundColor,
            opacity: interpolate(
              frame,
              [0, durationInFrames / 2, durationInFrames],
              [0, 1, 0]
            ),
          }}
        />
      );

    default:
      return (
        <AbsoluteFill style={{ backgroundColor: theme.backgroundColor }}>
          <ContentSlide
            header={scene.type.charAt(0).toUpperCase() + scene.type.slice(1)}
            content={scene.description}
            className="bg-transparent"
          />
        </AbsoluteFill>
      );
  }
};

/**
 * Main DynamicPreview composition
 *
 * LAYERED ARCHITECTURE (PROPER B-ROLL OVERLAY SUPPORT):
 * 1. Music Layer - Background music with fade in/out
 * 2. Audio Layer - Continuous A-roll audio that plays through B-roll overlays
 * 3. Video Layer - Sequential scenes (title, a-roll, content, cta) - NOT b-roll-overlay
 * 4. B-Roll Overlay Layer - B-roll visuals that overlay A-roll at specific times
 * 5. Caption Layer - TikTok-style subtitles on top
 *
 * KEY CONCEPT: B-roll-overlay scenes are NOT sequential. They are visual overlays
 * that appear DURING an A-roll scene while the A-roll AUDIO continues.
 */
export const DynamicPreview: React.FC<DynamicPreviewProps> = ({
  scenes = DEFAULT_SCENES,
  theme = DEFAULT_THEME,
  music,
}) => {
  const { fps } = useVideoConfig();

  const actualTheme = { ...DEFAULT_THEME, ...theme };
  const actualScenes = scenes || DEFAULT_SCENES;

  // Separate B-roll overlays from sequential scenes
  // B-roll overlays have overlayOnAroll reference and should NOT be in sequential timeline
  const { sequentialScenes, bRollOverlays } = useMemo(() => {
    const sequential: Scene[] = [];
    const overlays: Scene[] = [];

    for (const scene of actualScenes) {
      if (scene.type === "b-roll-overlay" && scene.overlayOnAroll) {
        overlays.push(scene);
      } else {
        sequential.push(scene);
      }
    }

    return { sequentialScenes: sequential, bRollOverlays: overlays };
  }, [actualScenes]);

  // Sort SEQUENTIAL scenes by order (not including b-roll overlays)
  const sortedSequentialScenes = useMemo(() => {
    return [...sequentialScenes].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return 0;
    });
  }, [sequentialScenes]);

  // Calculate frame positions for SEQUENTIAL scenes only
  // This creates the main timeline without B-roll interruptions
  const sceneFrames = useMemo(() => {
    let currentFrame = 0;
    return sortedSequentialScenes.map((scene) => {
      const startFrame = currentFrame;
      const durationInFrames = Math.max(1, Math.round(scene.duration * fps));
      currentFrame += durationInFrames;
      return { scene, startFrame, durationInFrames };
    });
  }, [sortedSequentialScenes, fps]);

  // Create a map of scene ID to frame info for B-roll overlay positioning
  const sceneFrameMap = useMemo(() => {
    const map = new Map<string, { startFrame: number; durationInFrames: number }>();
    for (const sf of sceneFrames) {
      map.set(sf.scene.id, { startFrame: sf.startFrame, durationInFrames: sf.durationInFrames });
    }
    return map;
  }, [sceneFrames]);

  // Calculate B-roll overlay frame positions based on their parent A-roll scenes
  const bRollOverlayFrames = useMemo(() => {
    return bRollOverlays.map((overlay) => {
      const parentInfo = sceneFrameMap.get(overlay.overlayOnAroll || "");
      if (!parentInfo) {
        console.warn(`B-roll overlay ${overlay.id} references unknown A-roll: ${overlay.overlayOnAroll}`);
        return null;
      }

      // Calculate when this overlay should appear
      // overlayStartTime = seconds into the A-roll when B-roll visual starts
      const overlayStartTimeFrames = Math.round((overlay.overlayStartTime || 0) * fps);
      const startFrame = parentInfo.startFrame + overlayStartTimeFrames;
      const durationInFrames = Math.max(1, Math.round(overlay.duration * fps));

      return { scene: overlay, startFrame, durationInFrames };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [bRollOverlays, sceneFrameMap, fps]);

  // Collect all words from A-roll scenes for captions
  // Words should have composition-timeline timestamps
  const captionSegments = useMemo(() => {
    const words: TranscriptWord[] = [];
    for (const { scene } of sceneFrames) {
      if ((scene.type === "a-roll" || scene.type === "video") && scene.words) {
        words.push(...scene.words);
      }
    }

    const sortedWords = words.sort((a, b) => a.start - b.start);

    if (sortedWords.length === 0) {
      return [];
    }

    const transcriptWords: SegmentTranscriptWord[] = sortedWords.map(w => ({
      word: w.text,
      start: w.start,
      end: w.end,
      confidence: 1,
      punctuated_word: w.text,
    }));

    // Use tighter config for better caption grouping
    return segmentTranscript(transcriptWords, {
      config: {
        minWords: 2,    // Allow 2-word groups for short phrases
        targetWords: 5, // Target 5 words for optimal readability
        maxWords: 8,    // Max 8 to prevent overflow
      }
    });
  }, [sceneFrames]);

  // Prefetch all video assets
  useMemo(() => {
    const allScenes = [...sceneFrames.map(sf => sf.scene), ...bRollOverlays];
    for (const scene of allScenes) {
      if (scene.asset && (scene.type === "a-roll" || scene.type === "b-roll" || scene.type === "b-roll-overlay" || scene.type === "video")) {
        const path = scene.asset.startsWith("assets/")
          ? scene.asset
          : `assets/videos/${scene.asset}`;
        try {
          prefetch(staticFile(path));
        } catch {
          // Ignore prefetch errors
        }
      }
    }
  }, [sceneFrames, bRollOverlays]);

  // A-roll scenes for continuous audio layer
  const audioScenes = useMemo(() => {
    return sceneFrames.filter(
      ({ scene }) => scene.type === "a-roll" || scene.type === "video"
    );
  }, [sceneFrames]);

  return (
    <>
      {/* LAYER 0: BASE BACKGROUND - Always black to prevent any white flashes */}
      <AbsoluteFill style={{ backgroundColor: "#000000" }} />

      {/* LAYER 1: MUSIC - Background music with fade */}
      {music && music.src && (
        <Music
          src={music.src}
          volume={music.volume}
          fadeInSeconds={music.fadeInSeconds}
          fadeOutSeconds={music.fadeOutSeconds}
          loop={music.loop ?? true}
        />
      )}

      {/* LAYER 2: AUDIO - Continuous A-roll audio (plays through B-roll visuals) */}
      {audioScenes.map(({ scene, startFrame, durationInFrames }) => {
        const videoPath = scene.asset
          ? scene.asset.startsWith("assets/")
            ? scene.asset
            : `assets/videos/${scene.asset}`
          : null;

        if (!videoPath) return null;

        return (
          <Sequence
            key={`audio-${scene.id}`}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <Audio
              src={staticFile(videoPath)}
              startFrom={Math.round((scene.assetStartTime || 0) * fps)}
              volume={1}
            />
          </Sequence>
        );
      })}

      {/* LAYER 3: VIDEO - Sequential scenes (excludes b-roll-overlay) */}
      {/* Use hardcoded black to prevent flashes regardless of theme */}
      <AbsoluteFill style={{ backgroundColor: "#000000" }}>
        {sceneFrames.map(({ scene, startFrame, durationInFrames }, index) => (
          <Sequence
            key={scene.id || `scene-${index}`}
            from={startFrame}
            durationInFrames={durationInFrames}
            name={`${scene.type}: ${scene.description.slice(0, 30)}...`}
            // Premount 60 frames (1s) early to allow video/content to load before appearing
            premountFor={60}
          >
            <SceneRenderer scene={scene} theme={actualTheme} />
            {scene.voiceoverAudio && (
              <Audio src={staticFile(scene.voiceoverAudio)} volume={1} />
            )}
          </Sequence>
        ))}
      </AbsoluteFill>

      {/* LAYER 4: B-ROLL OVERLAYS - Visual overlays on top of A-roll */}
      {/* These appear at specific times DURING A-roll scenes while audio continues */}
      {bRollOverlayFrames.map(({ scene, startFrame, durationInFrames }, index) => {
        const videoPath = scene.asset
          ? scene.asset.startsWith("assets/")
            ? scene.asset
            : `assets/videos/${scene.asset}`
          : null;

        if (!videoPath) return null;

        return (
          <Sequence
            key={`broll-${scene.id || index}`}
            from={startFrame}
            durationInFrames={durationInFrames}
            name={`B-roll: ${scene.description.slice(0, 30)}...`}
            // Premount 30 frames (0.5s) early to allow video to load before appearing
            premountFor={30}
          >
            <AbsoluteFill style={{ backgroundColor: "#000000" }}>
              <OffthreadVideo
                src={staticFile(videoPath)}
                startFrom={Math.round((scene.assetStartTime || 0) * fps)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  // Ensure video shows black background while loading, not white
                  backgroundColor: "#000",
                }}
                muted // B-roll is ALWAYS muted - A-roll audio continues underneath
                // Pause playback while video loads to prevent black flashes
                pauseWhenBuffering
                // Handle errors gracefully
                onError={(err) => {
                  console.error(`[DynamicPreview] B-roll error for ${videoPath}:`, err);
                }}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* LAYER 5: CAPTIONS - TikTok-style subtitles with semantic phrase grouping */}
      {captionSegments.length > 0 && (
        <TikTokCaption segments={captionSegments} accentColor={actualTheme.primaryColor} />
      )}
    </>
  );
};

export default DynamicPreview;
