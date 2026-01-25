/**
 * Type definitions for Stan Video Editor
 */

export interface Word {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptData {
  text: string; // Full transcript text
  words: Word[]; // Word-level timestamps
}

export type TranscriptStatus = "pending" | "processing" | "complete" | "error";

export interface VideoClip {
  id: string;
  file: File;
  name: string;
  size: number;
  duration: number | null; // Will be populated after metadata loads
  thumbnail: string | null; // Base64 data URL for thumbnail
  createdAt: number;
  transcript: TranscriptData | null; // Transcription data
  transcriptStatus: TranscriptStatus; // Transcription status
}

export interface ClipMetadata {
  id: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface ProjectState {
  clips: VideoClip[];
  transcript: string | null;
  composition: any | null; // Remotion composition config
}

// Chat types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ClipInfo {
  id: string;
  name: string;
  duration: number | null;
  transcript: string | null;
}

// ============================================
// Asset and Project Types for Video Generator
// ============================================

export type AssetType = "image" | "video" | "audio" | "logo" | "document";

export interface UploadedAsset {
  id: string;
  type: AssetType;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  thumbnail: string | null;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    transcript?: string;
  };
  createdAt: number;
  publicPath?: string; // Server path from upload API (e.g., "assets/videos/video_0.mp4")
}

export type VideoStyle =
  | "modern"
  | "minimal"
  | "bold"
  | "playful"
  | "corporate"
  | "cinematic";

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";

export type MusicMood =
  | "upbeat"
  | "chill"
  | "dramatic"
  | "energetic"
  | "corporate"
  | "none";

export type TextAnimation =
  | "bounce"
  | "shake"
  | "glow"
  | "typewriter"
  | "slide-up"
  | "pop"
  | "none";

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  style: VideoStyle;
  aspectRatio: AspectRatio;
  musicMood: MusicMood;
  sfxEnabled: boolean;
  textAnimation: TextAnimation;
}

export type ProjectStatus =
  | "draft"
  | "planning"
  | "generating"
  | "preview"
  | "complete"
  | "error";

export interface Project {
  id: string;
  name: string;
  assets: UploadedAsset[];
  theme: ThemeConfig;
  prompt: string;
  status: ProjectStatus;
  storyboard?: Scene[];
  compositionCode?: string;
  outputUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Scene {
  id: string;
  order: number;
  type: "title" | "content" | "video" | "image" | "transition";
  duration: number;
  description: string;
  assets: string[];
  text?: string;
  voiceover?: string;
  animation?: string;
  music?: {
    type: "background" | "sfx";
    description: string;
  };
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: "#8B5CF6",
  secondaryColor: "#06B6D4",
  backgroundColor: "#0F0F0F",
  textColor: "#FFFFFF",
  fontFamily: "Inter, sans-serif",
  style: "modern",
  aspectRatio: "9:16",
  musicMood: "chill",
  sfxEnabled: true,
  textAnimation: "pop",
};
