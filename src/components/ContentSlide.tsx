import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import { zTextarea } from "@remotion/zod-types";
import { AnimatedText, textAnimationSchema } from "./AnimatedText";

export const contentSlideSchema = z.object({
  header: z.string(),
  content: zTextarea(),
  className: z.string().optional(),
  headerAnimation: textAnimationSchema.optional(),
  contentAnimation: textAnimationSchema.optional(),
  highlightWords: z.array(z.string()).optional(),
  accentColor: z.string().optional(),
});

type ContentSlideProps = z.infer<typeof contentSlideSchema>;

export const ContentSlide: React.FC<ContentSlideProps> = ({
  header,
  content,
  className,
  headerAnimation,
  contentAnimation,
  highlightWords,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  // Use legacy fade-in if no animation specified
  const useLegacyAnimation = !headerAnimation && !contentAnimation;

  const opacity = useLegacyAnimation
    ? interpolate(frame, [0, 20], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill className={`bg-black flex flex-col items-start justify-start px-32 pt-24 ${className ?? ""}`}>
      <div
        className="w-full"
        style={{
          opacity: useLegacyAnimation ? opacity : 1,
        }}
      >
        <h1 className="text-6xl font-bold text-white mb-12">
          {headerAnimation && headerAnimation !== "none" ? (
            <AnimatedText
              text={header}
              animation={headerAnimation}
              highlightWords={highlightWords}
              accentColor={accentColor ?? "#FFD700"}
              delay={0}
            />
          ) : (
            header
          )}
        </h1>
        <p className="text-4xl text-gray-300 leading-relaxed">
          {contentAnimation && contentAnimation !== "none" ? (
            <AnimatedText
              text={content}
              animation={contentAnimation}
              highlightWords={highlightWords}
              accentColor={accentColor ?? "#FFD700"}
              delay={15}
            />
          ) : (
            content
          )}
        </p>
      </div>
    </AbsoluteFill>
  );
};
