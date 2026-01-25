/**
 * Interactive Transcript Panel
 *
 * Displays the full transcript with clickable words that seek to timestamps.
 * Features:
 * - Words grouped by clip with headers
 * - Current word highlighted during playback
 * - Click any word to jump to that exact moment
 * - Copy transcript button
 * - Auto-scroll to follow playback
 *
 * Phase 12 Implementation
 */

"use client";

import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";

// ============================================
// Types
// ============================================

export interface TranscriptWord {
  text: string;
  start: number; // Start time in seconds (composition timeline)
  end: number; // End time in seconds
}

export interface ClipTranscript {
  clipId: string;
  clipName: string;
  startTime: number; // When this clip starts in composition
  endTime: number; // When this clip ends in composition
  words: TranscriptWord[];
}

export interface TranscriptPanelProps {
  clips: ClipTranscript[];
  currentTime: number; // Current playback time in seconds
  onSeek: (time: number) => void;
  isVisible?: boolean;
  onToggle?: () => void;
  /** Callback when user wants to remove a specific word occurrence */
  onRemoveWord?: (word: TranscriptWord, clipId: string) => void;
  /** Callback when user wants to remove all instances of a word */
  onRemoveAllInstances?: (wordText: string) => void;
}

// ============================================
// Main Component
// ============================================

export function TranscriptPanel({
  clips,
  currentTime,
  onSeek,
  isVisible = true,
  onToggle,
  onRemoveWord,
  onRemoveAllInstances,
}: TranscriptPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    word: TranscriptWord;
    clipId: string;
  } | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("contextmenu", handleClickOutside);
      return () => {
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("contextmenu", handleClickOutside);
      };
    }
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, word: TranscriptWord, clipId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, word, clipId });
  }, []);

  // Find currently active word across all clips
  const activeWord = useMemo(() => {
    for (const clip of clips) {
      for (let i = 0; i < clip.words.length; i++) {
        const word = clip.words[i];
        if (currentTime >= word.start && currentTime < word.end) {
          return { clipId: clip.clipId, wordIndex: i };
        }
      }
    }
    return null;
  }, [clips, currentTime]);

  // Auto-scroll to follow the active word
  useEffect(() => {
    if (autoScroll && activeWordRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const word = activeWordRef.current;

      const containerRect = container.getBoundingClientRect();
      const wordRect = word.getBoundingClientRect();

      // Check if word is outside the visible area
      const isAbove = wordRect.top < containerRect.top + 60;
      const isBelow = wordRect.bottom > containerRect.bottom - 60;

      if (isAbove || isBelow) {
        word.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeWord, autoScroll]);

  const handleWordClick = useCallback(
    (time: number) => {
      onSeek(time);
    },
    [onSeek]
  );

  const handleCopyTranscript = useCallback(() => {
    const fullText = clips
      .map((clip) => {
        const text = clip.words.map((w) => w.text).join(" ");
        return `[${clip.clipName}]\n${text}`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [clips]);

  // Calculate stats
  const totalWords = clips.reduce((sum, c) => sum + c.words.length, 0);
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.endTime), 0);

  // Collapsed state - show button to expand
  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 top-20 z-50 bg-purple-600 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
        title="Show Transcript"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span className="text-sm font-medium">Transcript</span>
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border-l border-zinc-800 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-purple-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-white font-medium text-sm">Transcript</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded transition-colors ${
              autoScroll
                ? "text-purple-400 bg-purple-500/20"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopyTranscript}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Copy transcript"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>

          {/* Close button */}
          <button
            onClick={onToggle}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Hide transcript"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable transcript */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onMouseEnter={() => setAutoScroll(false)}
        onMouseLeave={() => setAutoScroll(true)}
      >
        {clips.length === 0 ? (
          <div className="text-center text-zinc-500 py-8">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">No transcript available</p>
            <p className="text-xs mt-1 opacity-70">
              Upload videos with speech to see transcripts
            </p>
          </div>
        ) : (
          clips.map((clip) => (
            <ClipSection
              key={clip.clipId}
              clip={clip}
              activeWordIndex={
                activeWord?.clipId === clip.clipId ? activeWord.wordIndex : null
              }
              activeWordRef={activeWordRef}
              onWordClick={handleWordClick}
              onContextMenu={(e, word) => handleContextMenu(e, word, clip.clipId)}
            />
          ))
        )}
      </div>

      {/* Footer stats */}
      {clips.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
          <span>
            {clips.length} clip{clips.length !== 1 ? "s" : ""} | {totalWords} words
          </span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          word={contextMenu.word}
          onClose={() => setContextMenu(null)}
          onRemove={() => {
            onRemoveWord?.(contextMenu.word, contextMenu.clipId);
            setContextMenu(null);
          }}
          onRemoveAll={() => {
            onRemoveAllInstances?.(contextMenu.word.text);
            setContextMenu(null);
          }}
          onCopy={() => {
            navigator.clipboard.writeText(contextMenu.word.text);
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// Clip Section Component
// ============================================

interface ClipSectionProps {
  clip: ClipTranscript;
  activeWordIndex: number | null;
  activeWordRef: React.RefObject<HTMLSpanElement | null>;
  onWordClick: (time: number) => void;
  onContextMenu: (e: React.MouseEvent, word: TranscriptWord) => void;
}

function ClipSection({
  clip,
  activeWordIndex,
  activeWordRef,
  onWordClick,
  onContextMenu,
}: ClipSectionProps) {
  if (clip.words.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-800/30 overflow-hidden">
        <div className="px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/50 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-600" />
          <span className="text-xs text-zinc-400 font-medium truncate">
            {clip.clipName}
          </span>
          <span className="text-xs text-zinc-600 ml-auto">
            {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
          </span>
        </div>
        <div className="p-3 text-xs text-zinc-600 italic">No speech detected</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-zinc-800/50 overflow-hidden">
      {/* Clip header */}
      <div className="px-3 py-2 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-xs text-zinc-300 font-medium truncate">
          {clip.clipName}
        </span>
        <span className="text-xs text-zinc-500 ml-auto">
          {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
        </span>
      </div>

      {/* Words */}
      <div className="p-3">
        <p className="text-sm leading-relaxed">
          {clip.words.map((word, i) => (
            <TranscriptWordSpan
              key={`${word.start}-${i}`}
              word={word}
              isActive={activeWordIndex === i}
              wordRef={activeWordIndex === i ? activeWordRef : undefined}
              onClick={() => onWordClick(word.start)}
              onContextMenu={(e) => onContextMenu(e, word)}
            />
          ))}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Word Span Component
// ============================================

interface TranscriptWordSpanProps {
  word: TranscriptWord;
  isActive: boolean;
  wordRef?: React.RefObject<HTMLSpanElement | null>;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TranscriptWordSpan({
  word,
  isActive,
  wordRef,
  onClick,
  onContextMenu,
}: TranscriptWordSpanProps) {
  return (
    <span
      ref={wordRef as React.RefObject<HTMLSpanElement>}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        cursor-pointer rounded px-0.5 transition-all duration-150 inline-block
        ${
          isActive
            ? "bg-purple-600 text-white scale-105 shadow-lg shadow-purple-500/30"
            : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
        }
      `}
      title={`Click to seek • Right-click for options`}
    >
      {word.text}{" "}
    </span>
  );
}

// ============================================
// Context Menu Component
// ============================================

interface ContextMenuProps {
  x: number;
  y: number;
  word: TranscriptWord;
  onClose: () => void;
  onRemove: () => void;
  onRemoveAll: () => void;
  onCopy: () => void;
}

function ContextMenu({
  x,
  y,
  word,
  onClose,
  onRemove,
  onRemoveAll,
  onCopy,
}: ContextMenuProps) {
  // Adjust position to keep menu within viewport
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = x;
      let newY = y;

      // Adjust if menu goes off right edge
      if (x + rect.width > viewportWidth - 10) {
        newX = viewportWidth - rect.width - 10;
      }
      // Adjust if menu goes off bottom edge
      if (y + rect.height > viewportHeight - 10) {
        newY = viewportHeight - rect.height - 10;
      }

      setAdjustedPos({ x: newX, y: newY });
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
        onClick={onRemove}
      >
        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Remove this word
      </button>
      <button
        className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
        onClick={onRemoveAll}
      >
        <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Remove all &quot;{word.text}&quot;
      </button>
      <div className="border-t border-zinc-700 my-1" />
      <button
        className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
        onClick={onCopy}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Copy word
      </button>
    </div>
  );
}

// ============================================
// Utility Functions
// ============================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ============================================
// Export helper to build clips from storyboard
// ============================================

export interface BuildClipsOptions {
  scenes: Array<{
    id: string;
    type: string;
    asset?: string;
    duration: number;
    compositionStartTime?: number;
    words?: TranscriptWord[];
    /** For B-roll overlays, references which A-roll scene this overlays */
    overlayOnAroll?: string;
  }>;
}

/**
 * Build ClipTranscript array from storyboard scenes
 * Extends A-roll transcript coverage through B-roll overlay sections
 * since A-roll audio continues playing underneath B-roll visuals
 */
export function buildClipTranscripts(options: BuildClipsOptions): ClipTranscript[] {
  const { scenes } = options;

  // Get A-roll scenes with words
  const aRollScenes = scenes.filter(
    (s) => (s.type === "a-roll" || s.type === "video") && s.words && s.words.length > 0
  );

  return aRollScenes.map((scene) => {
    // Find B-roll overlays that reference this A-roll scene
    // B-roll audio is muted, but A-roll audio continues - so captions should too
    const overlays = scenes.filter(
      (s) => s.type === "b-roll-overlay" && s.overlayOnAroll === scene.id
    );

    // Calculate base end time
    const baseEndTime = (scene.compositionStartTime || 0) + scene.duration;

    // Extend end time to cover any B-roll overlays
    // This ensures captions continue showing during B-roll sections
    const extendedEndTime = overlays.reduce((max, overlay) => {
      const overlayEnd = (overlay.compositionStartTime || 0) + overlay.duration;
      return Math.max(max, overlayEnd);
    }, baseEndTime);

    return {
      clipId: scene.id,
      clipName: scene.asset?.split("/").pop() || scene.id,
      startTime: scene.compositionStartTime || 0,
      endTime: extendedEndTime,
      words: scene.words || [],
    };
  });
}
