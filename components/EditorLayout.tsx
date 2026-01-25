"use client";

import { useState, useEffect, useCallback } from "react";
import UploadPanel from "./UploadPanel";
import PreviewPanel from "./PreviewPanel";
import type { VideoClip } from "@/lib/types";
import { clipStorage } from "@/lib/storage";

export default function EditorLayout() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load clips from IndexedDB on mount
  useEffect(() => {
    const loadClips = async () => {
      try {
        const savedClips = await clipStorage.getAllClips();
        setClips(savedClips);
      } catch (error) {
        console.error("Failed to load clips:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadClips();
  }, []);

  // Callback for when clips are updated
  const handleClipsChange = useCallback((newClips: VideoClip[]) => {
    setClips(newClips);
  }, []);

  return (
    <main className="h-screen flex overflow-hidden">
      {/* Left Panel - Upload/Chat (40% width) */}
      <div className="w-[40%] min-w-[400px]">
        <UploadPanel
          clips={clips}
          onClipsChange={handleClipsChange}
          isLoading={isLoading}
        />
      </div>

      {/* Right Panel - Preview (60% width) */}
      <div className="flex-1">
        <PreviewPanel clips={clips} />
      </div>
    </main>
  );
}
