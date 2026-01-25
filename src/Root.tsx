import "./index.css";
import { Composition, Folder } from "remotion";
import { z } from "zod";
import { TitleSlide, titleSlideSchema } from "./components/TitleSlide";
import { ContentSlide, contentSlideSchema } from "./components/ContentSlide";
import { VideoSlide, videoSlideSchema } from "./components/VideoSlide";
import { Code, codeSchema } from "./components/Code";
import { CodeSlide, codeSlideSchema } from "./components/CodeSlide";
import { AsciiPlayer, asciiPlayerSchema } from "./components/AsciiPlayer";
import { Screenshot, screenshotSchema } from "./components/Screenshot";
import { DiagramSlide, diagramSlideSchema } from "./components/DiagramSlide";
import { Music, musicSchema } from "./components/Music";
import { ZoomableVideo, zoomableVideoSchema } from "./components/ZoomableVideo";
import { DynamicPreview } from "./compositions/dynamic-preview";
import {
  Example1Landscape,
  Example1Square,
} from "./compositions/example1/Composition";
import { Example2Square } from "./compositions/example2/Composition";
import { MyVideo } from "./compositions/my-video/Composition";
import { VIDEO_CONFIG, getDurationInFrames } from "./config";
import {
  sampleTypeScript,
  sampleHighlightedTypeScript,
  sampleD2Diagram,
} from "./content";

// Schema for DynamicPreview props (used for rendering)
const dynamicPreviewSchema = z.object({
  scenes: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      duration: z.number(),
      description: z.string(),
      text: z.string().optional(),
      assets: z.array(z.string()).optional(),
      voiceover: z.string().optional(),
      voiceoverAudio: z.string().optional(), // Path to generated voiceover audio
      animation: z.string().optional(),
      order: z.number().optional(),
    })
  ),
  totalDuration: z.number(),
  theme: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string().optional(),
    backgroundColor: z.string(),
    textColor: z.string(),
    style: z.string().optional(),
  }),
});

// Default props for DynamicPreview compositions
const dynamicPreviewDefaultProps = {
  scenes: [],
  totalDuration: 30,
  theme: {
    primaryColor: "#8B5CF6",
    backgroundColor: "#000000",
    textColor: "#FFFFFF",
  },
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Compositions - use /new-composition to create your own */}
      <Folder name="Compositions">
        <Folder name="MyVideo">
          <MyVideo />
        </Folder>

        {/* Example compositions for reference */}
        <Folder name="Examples">
          <Folder name="Example1">
            <Example1Landscape />
            <Example1Square />
          </Folder>

          <Folder name="Example2">
            <Example2Square />
          </Folder>
        </Folder>
      </Folder>

      {/* Generated video compositions - used by /api/render */}
      <Folder name="Generated">
        <Composition
          id="DynamicPreview-Portrait"
          component={DynamicPreview}
          durationInFrames={60 * 30} // 30 seconds default, overridden by calculateMetadata
          fps={60}
          width={1080}
          height={1920}
          schema={dynamicPreviewSchema}
          calculateMetadata={async ({ props }) => {
            const totalDuration = props.totalDuration || 30;
            return {
              durationInFrames: Math.ceil(totalDuration * 60),
            };
          }}
          defaultProps={dynamicPreviewDefaultProps}
        />
        <Composition
          id="DynamicPreview-Landscape"
          component={DynamicPreview}
          durationInFrames={60 * 30}
          fps={60}
          width={1920}
          height={1080}
          schema={dynamicPreviewSchema}
          calculateMetadata={async ({ props }) => {
            const totalDuration = props.totalDuration || 30;
            return {
              durationInFrames: Math.ceil(totalDuration * 60),
            };
          }}
          defaultProps={dynamicPreviewDefaultProps}
        />
        <Composition
          id="DynamicPreview-Square"
          component={DynamicPreview}
          durationInFrames={60 * 30}
          fps={60}
          width={1080}
          height={1080}
          schema={dynamicPreviewSchema}
          calculateMetadata={async ({ props }) => {
            const totalDuration = props.totalDuration || 30;
            return {
              durationInFrames: Math.ceil(totalDuration * 60),
            };
          }}
          defaultProps={dynamicPreviewDefaultProps}
        />
      </Folder>

      <Folder name="Components">
        <Composition
          id="TitleSlide"
          component={TitleSlide}
          durationInFrames={getDurationInFrames(1, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={titleSlideSchema}
          defaultProps={{
            title: "Example Title",
          }}
        />
        <Composition
          id="ContentSlide"
          component={ContentSlide}
          durationInFrames={getDurationInFrames(1, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={contentSlideSchema}
          defaultProps={{
            header: "Example Header",
            content: "Example Content",
          }}
        />
        <Composition
          id="VideoSlide"
          component={VideoSlide}
          durationInFrames={getDurationInFrames(7, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={videoSlideSchema}
          defaultProps={{
            filename: "videos/robot_nature.mp4",
            startTime: 0,
          }}
        />
        <Composition
          id="Code"
          component={Code}
          durationInFrames={getDurationInFrames(5, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={codeSchema}
          defaultProps={{
            code: sampleTypeScript,
            language: "typescript",
          }}
        />
        <Composition
          id="CodeSlide"
          component={CodeSlide}
          durationInFrames={getDurationInFrames(10, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={codeSlideSchema}
          defaultProps={{
            title: "Animated Line Highlights",
            code: sampleHighlightedTypeScript,
            language: "typescript",
            animatedHighlights: [
              { timeInSeconds: 0, lines: "1-5" },
              { timeInSeconds: 2, lines: "7-10" },
              { timeInSeconds: 4, lines: "12-19" },
            ],
          }}
        />
        <Composition
          id="AsciiPlayer"
          component={AsciiPlayer}
          durationInFrames={getDurationInFrames(10, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={asciiPlayerSchema}
          defaultProps={{
            mode: "animated" as const,
            castFile: "casts/sample.cast",
            playbackSpeed: 1,
            startTime: 0,
            theme: "nord" as const,
          }}
        />
        <Composition
          id="Screenshot"
          component={Screenshot}
          durationInFrames={getDurationInFrames(10, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={screenshotSchema}
          defaultProps={{
            src: "images/sample-screenshot.png",
            scrollSpeed: 100,
          }}
        />
        <Composition
          id="DiagramSlide"
          component={DiagramSlide}
          durationInFrames={getDurationInFrames(5, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={diagramSlideSchema}
          defaultProps={{
            title: "System Architecture",
            type: "d2" as const,
            diagram: sampleD2Diagram,
            sketch: false,
          }}
        />
        <Composition
          id="Music"
          component={Music}
          durationInFrames={getDurationInFrames(10, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={musicSchema}
          defaultProps={{
            src: "audio/sample-music.mp3",
            volume: 0.5,
            fadeInSeconds: 1,
            fadeOutSeconds: 2,
          }}
        />
        <Composition
          id="ZoomableVideo"
          component={ZoomableVideo}
          durationInFrames={getDurationInFrames(10, VIDEO_CONFIG.fps)}
          fps={VIDEO_CONFIG.fps}
          width={VIDEO_CONFIG.width}
          height={VIDEO_CONFIG.height}
          schema={zoomableVideoSchema}
          defaultProps={{
            src: "videos/robot_nature.mp4",
            zoomSegments: [
              { startTime: 0, endTime: 3, zoomStart: 1, zoomEnd: 1.1 },
              { startTime: 5, endTime: 8, zoomStart: 1.1, zoomEnd: 1 },
            ],
          }}
        />
      </Folder>
    </>
  );
};
