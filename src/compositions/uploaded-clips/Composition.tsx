import { AbsoluteFill, Series } from "remotion";
import { VideoSlide } from "../../components/VideoSlide";

interface UploadedClipsProps {
  clips: Array<{
    id: string;
    filename: string;
    duration: number;
  }>;
}

export const UploadedClipsComposition: React.FC<UploadedClipsProps> = ({
  clips,
}) => {
  if (clips.length === 0) {
    return (
      <AbsoluteFill className="bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-2xl">No clips uploaded</p>
          <p className="text-sm text-gray-400 mt-2">
            Upload 3-5 video clips to get started
          </p>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill className="bg-black">
      <Series>
        {clips.map((clip) => (
          <Series.Sequence
            key={clip.id}
            durationInFrames={Math.floor(clip.duration * 60)} // 60fps
          >
            <VideoSlide filename={clip.filename} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
