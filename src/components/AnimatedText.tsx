/**
 * AnimatedText Component
 *
 * TikTok-style animated text with multiple presets:
 * - bounce: Text bounces in from below with overshoot
 * - shake: Subtle horizontal vibration
 * - glow: Pulsing text shadow effect
 * - typewriter: Characters appear one by one
 * - slide-up: Text slides up and fades in
 * - pop: Text scales from 0 with spring
 * - none: No animation (instant display)
 *
 * Supports word-by-word animation and keyword highlighting.
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { z } from "zod";

// Animation type schema
export const textAnimationSchema = z.enum([
  "bounce",
  "shake",
  "glow",
  "typewriter",
  "slide-up",
  "pop",
  "none",
]);

export type TextAnimation = z.infer<typeof textAnimationSchema>;

// Props schema - all fields with defaults are optional to make component easy to use
export const animatedTextSchema = z.object({
  text: z.string(),
  animation: textAnimationSchema.optional(), // defaults to "none"
  className: z.string().optional(),
  delay: z.number().optional(), // frames to delay start, defaults to 0
  duration: z.number().optional(), // frames for animation (defaults vary by animation)
  wordByWord: z.boolean().optional(), // animate each word separately, defaults to false
  highlightWords: z.array(z.string()).optional(), // words to highlight
  accentColor: z.string().optional(), // defaults to gold "#FFD700"
  staggerDelay: z.number().optional(), // frames between each word, defaults to 4
});

export type AnimatedTextProps = z.infer<typeof animatedTextSchema>;

/**
 * Calculate animation style for a single word/text element
 */
function getAnimationStyle(
  animation: TextAnimation,
  frame: number,
  fps: number,
  delay: number,
  duration?: number
): React.CSSProperties {
  const adjustedFrame = Math.max(0, frame - delay);

  switch (animation) {
    case "bounce": {
      const animDuration = duration ?? 30;
      const progress = spring({
        frame: adjustedFrame,
        fps,
        config: {
          damping: 8,
          stiffness: 100,
          mass: 0.5,
        },
        durationInFrames: animDuration,
      });
      const translateY = interpolate(progress, [0, 1], [50, 0]);
      const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return {
        transform: `translateY(${translateY}px)`,
        opacity,
      };
    }

    case "shake": {
      // Continuous subtle shake
      const shakeIntensity = 3;
      const shakeSpeed = 0.5;
      const fadeIn = interpolate(adjustedFrame, [0, 15], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      // Use sin wave for shake
      const shakeX = Math.sin(adjustedFrame * shakeSpeed) * shakeIntensity;
      return {
        transform: `translateX(${shakeX}px)`,
        opacity: fadeIn,
      };
    }

    case "glow": {
      const fadeIn = interpolate(adjustedFrame, [0, 20], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      // Pulsing glow effect
      const glowIntensity = interpolate(
        Math.sin(adjustedFrame * 0.15),
        [-1, 1],
        [10, 25]
      );
      return {
        opacity: fadeIn,
        textShadow: `0 0 ${glowIntensity}px currentColor, 0 0 ${glowIntensity * 2}px currentColor`,
      };
    }

    case "typewriter": {
      // This animation is handled differently - returns opacity only
      // The actual typewriter effect is in the component render
      return {
        opacity: 1,
      };
    }

    case "slide-up": {
      const animDuration = duration ?? 20;
      const progress = interpolate(adjustedFrame, [0, animDuration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      const translateY = interpolate(progress, [0, 1], [30, 0]);
      const opacity = interpolate(progress, [0, 0.5], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return {
        transform: `translateY(${translateY}px)`,
        opacity,
      };
    }

    case "pop": {
      const animDuration = duration ?? 25;
      const scale = spring({
        frame: adjustedFrame,
        fps,
        config: {
          damping: 10,
          stiffness: 200,
          mass: 0.4,
        },
        durationInFrames: animDuration,
      });
      const opacity = interpolate(adjustedFrame, [0, 5], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return {
        transform: `scale(${scale})`,
        opacity,
      };
    }

    case "none":
    default:
      return {};
  }
}

/**
 * Render typewriter animation
 */
function TypewriterText({
  text,
  frame,
  delay,
  duration,
  className,
  highlightWords,
  accentColor,
}: {
  text: string;
  frame: number;
  delay: number;
  duration?: number;
  className?: string;
  highlightWords?: string[];
  accentColor: string;
}) {
  const adjustedFrame = Math.max(0, frame - delay);
  const charsPerFrame = 0.5; // 2 frames per character
  const animDuration = duration ?? Math.ceil(text.length / charsPerFrame);
  const visibleChars = Math.min(
    text.length,
    Math.floor(adjustedFrame * charsPerFrame)
  );

  const visibleText = text.slice(0, visibleChars);
  const cursorVisible = adjustedFrame < animDuration && adjustedFrame % 30 < 15;

  // Highlight logic for visible text
  const highlightedText = highlightWords?.length
    ? highlightTextParts(visibleText, highlightWords, accentColor)
    : visibleText;

  return (
    <span className={className}>
      {highlightedText}
      {cursorVisible && (
        <span className="animate-pulse" style={{ color: accentColor }}>
          |
        </span>
      )}
    </span>
  );
}

/**
 * Helper to highlight specific words in text
 */
function highlightTextParts(
  text: string,
  highlightWords: string[],
  accentColor: string
): React.ReactNode {
  if (!highlightWords.length) return text;

  const regex = new RegExp(`(${highlightWords.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    const isHighlighted = highlightWords.some(
      (word) => word.toLowerCase() === part.toLowerCase()
    );
    if (isHighlighted) {
      return (
        <span key={index} style={{ color: accentColor }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

/**
 * Word-by-word animated text
 */
function WordByWordText({
  text,
  animation,
  frame,
  fps,
  delay,
  duration,
  staggerDelay,
  className,
  highlightWords,
  accentColor,
}: {
  text: string;
  animation: TextAnimation;
  frame: number;
  fps: number;
  delay: number;
  duration?: number;
  staggerDelay: number;
  className?: string;
  highlightWords?: string[];
  accentColor: string;
}) {
  const words = text.split(/\s+/);

  return (
    <span className={className}>
      {words.map((word, index) => {
        const wordDelay = delay + index * staggerDelay;
        const style = getAnimationStyle(animation, frame, fps, wordDelay, duration);
        const isHighlighted = highlightWords?.some(
          (hw) => hw.toLowerCase() === word.toLowerCase()
        );

        return (
          <span
            key={index}
            style={{
              ...style,
              display: "inline-block",
              color: isHighlighted ? accentColor : undefined,
            }}
          >
            {word}
            {index < words.length - 1 ? "\u00A0" : ""}
          </span>
        );
      })}
    </span>
  );
}

/**
 * AnimatedText Component
 *
 * Main export for animated text in Remotion compositions.
 */
export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  animation = "none",
  className = "",
  delay = 0,
  duration,
  wordByWord = false,
  highlightWords,
  accentColor = "#FFD700",
  staggerDelay = 4,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Typewriter animation has special handling
  if (animation === "typewriter") {
    return (
      <TypewriterText
        text={text}
        frame={frame}
        delay={delay}
        duration={duration}
        className={className}
        highlightWords={highlightWords}
        accentColor={accentColor}
      />
    );
  }

  // Word-by-word animation
  if (wordByWord) {
    return (
      <WordByWordText
        text={text}
        animation={animation}
        frame={frame}
        fps={fps}
        delay={delay}
        duration={duration}
        staggerDelay={staggerDelay}
        className={className}
        highlightWords={highlightWords}
        accentColor={accentColor}
      />
    );
  }

  // Single text animation
  const style = getAnimationStyle(animation, frame, fps, delay, duration);

  // Apply highlighting
  const renderedText = highlightWords?.length
    ? highlightTextParts(text, highlightWords, accentColor)
    : text;

  return (
    <span className={className} style={style}>
      {renderedText}
    </span>
  );
};

export default AnimatedText;
