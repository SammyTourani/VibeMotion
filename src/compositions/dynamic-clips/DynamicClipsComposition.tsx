import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig } from "remotion";

export interface DynamicClip {
  id: string;
  src: string; // Blob URL or data URL
  durationInFrames: number;
  name: string;
}

export interface DynamicClipsProps {
  clips: DynamicClip[];
}

// Simple video component that works with blob URLs
// Uses HTML5 video element for client-side compatibility
const ClipVideo: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  return (
    <AbsoluteFill className="bg-black items-center justify-center">
      <video
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
        ref={(video) => {
          if (video) {
            // Sync video to current frame
            if (Math.abs(video.currentTime - currentTime) > 0.1) {
              video.currentTime = currentTime;
            }
          }
        }}
        muted
        playsInline
      />
    </AbsoluteFill>
  );
};

// Empty state component
const EmptyState: React.FC = () => {
  return (
    <AbsoluteFill className="bg-gray-900 items-center justify-center">
      <div className="text-center p-8">
        <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 4V2m0 2v2m0-2h10M7 8h10M5 12h14M5 16h14M5 20h14"
            />
          </svg>
        </div>
        <p className="text-xl font-medium text-white mb-2">No Clips Added</p>
        <p className="text-sm text-gray-400">
          Upload video clips to preview your composition
        </p>
      </div>
    </AbsoluteFill>
  );
};

export const DynamicClipsComposition: React.FC<DynamicClipsProps> = ({
  clips,
}) => {
  if (!clips || clips.length === 0) {
    return <EmptyState />;
  }

  return (
    <AbsoluteFill className="bg-black">
      <Series>
        {clips.map((clip) => (
          <Series.Sequence key={clip.id} durationInFrames={clip.durationInFrames}>
            <ClipVideo src={clip.src} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};

// Calculate total duration from clips
export const calculateTotalDuration = (clips: DynamicClip[]): number => {
  return clips.reduce((total, clip) => total + clip.durationInFrames, 0);
};

// Convert VideoClip to DynamicClip format
export const convertToDynamicClip = (
  clip: { id: string; name: string; duration: number | null },
  blobUrl: string,
  fps: number = 30
): DynamicClip => {
  const duration = clip.duration || 5; // Default 5 seconds if no duration
  return {
    id: clip.id,
    src: blobUrl,
    durationInFrames: Math.ceil(duration * fps),
    name: clip.name,
  };
};
