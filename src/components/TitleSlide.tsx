import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import { AnimatedText, textAnimationSchema } from "./AnimatedText";

export const titleSlideSchema = z.object({
  title: z.string(),
  className: z.string().optional(),
  animation: textAnimationSchema.optional(),
  wordByWord: z.boolean().optional(),
  highlightWords: z.array(z.string()).optional(),
  accentColor: z.string().optional(),
});

type TitleSlideProps = z.infer<typeof titleSlideSchema>;

export const TitleSlide: React.FC<TitleSlideProps> = ({
  title,
  className,
  animation,
  wordByWord = false,
  highlightWords,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  // Use legacy fade-in if no animation specified
  const useLegacyAnimation = !animation || animation === "none";

  const opacity = useLegacyAnimation
    ? interpolate(frame, [0, 30], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill className={`bg-black flex items-center justify-center ${className ?? ""}`}>
      <div
        className="text-8xl font-bold text-white text-center px-8"
        style={{
          opacity: useLegacyAnimation ? opacity : 1,
        }}
      >
        {animation && animation !== "none" ? (
          <AnimatedText
            text={title}
            animation={animation}
            wordByWord={wordByWord}
            highlightWords={highlightWords}
            accentColor={accentColor ?? "#FFD700"}
            delay={0}
          />
        ) : (
          title
        )}
      </div>
    </AbsoluteFill>
  );
};
