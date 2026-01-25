/**
 * Transcript Validator
 *
 * Filters out Whisper hallucinations and invalid word timestamps.
 *
 * KNOWN WHISPER HALLUCINATION PATTERNS:
 * 1. Words with zero duration (start === end)
 * 2. Words with impossibly short duration (< 50ms)
 * 3. Sequences of words with identical timestamps
 * 4. Suspiciously high word density (> 8 words/second in a window)
 * 5. Empty or whitespace-only words
 * 6. Common hallucination phrases during silence
 */

import type { TranscriptWord } from "./types";

// Minimum word duration in seconds (50ms)
const MIN_WORD_DURATION = 0.05;

// Maximum words per second (realistic speech is 2-4 wps, fast is 5-6)
const MAX_WORDS_PER_SECOND = 8;

// Window size for density calculation (in seconds)
const DENSITY_WINDOW_SIZE = 1.0;

// Common Whisper hallucination phrases
const HALLUCINATION_PATTERNS = [
  /^(thank\s*you\s*for\s*watching)/i,
  /^(please\s*subscribe)/i,
  /^(like\s*and\s*subscribe)/i,
  /^(see\s*you\s*in\s*the\s*next)/i,
  /^(don't\s*forget\s*to)/i,
  /^(music\s*playing)/i,
  /^(\[.*\])/,  // Bracketed annotations like [Music]
  /^(\.+)$/,    // Just periods
];

export interface ValidationResult {
  validWords: TranscriptWord[];
  removedWords: TranscriptWord[];
  stats: {
    originalCount: number;
    validCount: number;
    removedCount: number;
    removalReasons: Record<string, number>;
  };
}

export interface ValidateOptions {
  /** Remove words with zero or very short duration */
  filterZeroDuration?: boolean;
  /** Remove sequences of words with identical timestamps */
  filterIdenticalTimestamps?: boolean;
  /** Remove words in high-density clusters (likely hallucination) */
  filterHighDensity?: boolean;
  /** Remove known hallucination phrases */
  filterHallucinationPhrases?: boolean;
  /** Remove empty/whitespace words */
  filterEmptyWords?: boolean;
  /** Log validation details */
  verbose?: boolean;
}

const DEFAULT_OPTIONS: ValidateOptions = {
  filterZeroDuration: true,
  filterIdenticalTimestamps: true,
  filterHighDensity: true,
  filterHallucinationPhrases: true,
  filterEmptyWords: true,
  verbose: false,
};

/**
 * Validate and filter transcript words to remove hallucinations
 */
export function validateTranscript(
  words: TranscriptWord[],
  options: ValidateOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const validWords: TranscriptWord[] = [];
  const removedWords: TranscriptWord[] = [];
  const removalReasons: Record<string, number> = {};

  const addRemoved = (word: TranscriptWord, reason: string) => {
    removedWords.push(word);
    removalReasons[reason] = (removalReasons[reason] || 0) + 1;
    if (opts.verbose) {
      console.log(`[TranscriptValidator] Removed "${word.text}" (${reason})`);
    }
  };

  // First pass: basic validation
  const passOneWords: TranscriptWord[] = [];

  for (const word of words) {
    // Filter empty words
    if (opts.filterEmptyWords && (!word.text || word.text.trim() === "")) {
      addRemoved(word, "empty_word");
      continue;
    }

    // Filter zero/short duration
    if (opts.filterZeroDuration) {
      const duration = word.end - word.start;
      if (duration <= 0) {
        addRemoved(word, "zero_duration");
        continue;
      }
      if (duration < MIN_WORD_DURATION) {
        addRemoved(word, "short_duration");
        continue;
      }
    }

    // Filter hallucination phrases (check full text accumulation)
    if (opts.filterHallucinationPhrases) {
      const isHallucination = HALLUCINATION_PATTERNS.some(pattern =>
        pattern.test(word.text.trim())
      );
      if (isHallucination) {
        addRemoved(word, "hallucination_phrase");
        continue;
      }
    }

    passOneWords.push(word);
  }

  // Second pass: identify sequences with identical timestamps
  if (opts.filterIdenticalTimestamps) {
    let identicalSequenceStart = -1;
    let lastTimestamp = -1;

    for (let i = 0; i < passOneWords.length; i++) {
      const word = passOneWords[i];
      const timestamp = word.start;

      if (timestamp === lastTimestamp) {
        // This word has same timestamp as previous
        if (identicalSequenceStart === -1) {
          identicalSequenceStart = i - 1;
        }
      } else {
        // Different timestamp - check if we had a sequence
        if (identicalSequenceStart !== -1) {
          // Mark all words in the sequence (except first) as hallucinated
          const sequenceLength = i - identicalSequenceStart;
          if (sequenceLength >= 3) {
            // 3+ words with identical timestamps = hallucination
            for (let j = identicalSequenceStart + 1; j < i; j++) {
              passOneWords[j] = { ...passOneWords[j], _remove: true } as TranscriptWord & { _remove?: boolean };
            }
            if (opts.verbose) {
              console.log(`[TranscriptValidator] Found hallucination sequence at ${timestamp}s (${sequenceLength} words)`);
            }
          }
        }
        identicalSequenceStart = -1;
      }
      lastTimestamp = timestamp;
    }

    // Check for sequence at end
    if (identicalSequenceStart !== -1) {
      const sequenceLength = passOneWords.length - identicalSequenceStart;
      if (sequenceLength >= 3) {
        for (let j = identicalSequenceStart + 1; j < passOneWords.length; j++) {
          passOneWords[j] = { ...passOneWords[j], _remove: true } as TranscriptWord & { _remove?: boolean };
        }
      }
    }
  }

  // Third pass: filter by density
  const passTwoWords = passOneWords.filter(w => {
    const extended = w as TranscriptWord & { _remove?: boolean };
    if (extended._remove) {
      addRemoved(w, "identical_timestamps");
      return false;
    }
    return true;
  });

  if (opts.filterHighDensity) {
    // Calculate word density in sliding windows
    for (let i = 0; i < passTwoWords.length; i++) {
      const word = passTwoWords[i];
      const windowStart = word.start;
      const windowEnd = windowStart + DENSITY_WINDOW_SIZE;

      // Count words in this window
      let wordsInWindow = 0;
      for (const w of passTwoWords) {
        if (w.start >= windowStart && w.start < windowEnd) {
          wordsInWindow++;
        }
      }

      // If density is too high, this might be hallucination
      if (wordsInWindow > MAX_WORDS_PER_SECOND * DENSITY_WINDOW_SIZE) {
        // Don't remove yet - just flag. We'll be conservative here.
        // Only remove if it's also at the end of the clip (common hallucination spot)
        if (i > passTwoWords.length * 0.8) {
          // This is in the last 20% of the transcript with high density
          (passTwoWords[i] as TranscriptWord & { _suspicious?: boolean })._suspicious = true;
        }
      }
    }
  }

  // Final pass: collect valid words
  for (const word of passTwoWords) {
    const extended = word as TranscriptWord & { _suspicious?: boolean };
    // For now, don't remove suspicious words, just log them
    if (extended._suspicious && opts.verbose) {
      console.log(`[TranscriptValidator] Suspicious high-density word: "${word.text}" at ${word.start}s`);
    }
    validWords.push({
      text: word.text,
      start: word.start,
      end: word.end,
    });
  }

  return {
    validWords,
    removedWords,
    stats: {
      originalCount: words.length,
      validCount: validWords.length,
      removedCount: removedWords.length,
      removalReasons,
    },
  };
}

/**
 * Quick check if a transcript appears to have hallucinations
 */
export function hasLikelyHallucinations(words: TranscriptWord[]): boolean {
  if (words.length < 3) return false;

  // Check for identical timestamps pattern
  let identicalCount = 0;
  let lastStart = -1;

  for (const word of words) {
    if (word.start === lastStart) {
      identicalCount++;
      if (identicalCount >= 3) return true;
    } else {
      identicalCount = 1;
    }
    lastStart = word.start;
  }

  // Check for zero-duration words
  const zeroDurationCount = words.filter(w => w.end - w.start <= 0).length;
  if (zeroDurationCount > words.length * 0.3) return true;

  return false;
}

/**
 * Get transcript quality score (0-100)
 */
export function getTranscriptQuality(words: TranscriptWord[]): number {
  if (words.length === 0) return 0;

  let score = 100;

  // Penalize zero-duration words
  const zeroDurationCount = words.filter(w => w.end - w.start <= 0).length;
  score -= (zeroDurationCount / words.length) * 50;

  // Penalize identical timestamps
  let identicalCount = 0;
  let lastStart = -1;
  for (const word of words) {
    if (word.start === lastStart) {
      identicalCount++;
    }
    lastStart = word.start;
  }
  score -= (identicalCount / words.length) * 30;

  // Penalize very short average word duration
  const avgDuration = words.reduce((sum, w) => sum + (w.end - w.start), 0) / words.length;
  if (avgDuration < 0.1) {
    score -= 20;
  }

  return Math.max(0, Math.round(score));
}
