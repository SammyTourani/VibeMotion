"use client";

import { useState, useRef } from "react";
import type { VideoClip } from "@/lib/types";
import { clipStorage } from "@/lib/storage";
import { generateThumbnail, getVideoMetadata } from "@/lib/video-utils";

interface UploadZoneProps {
  onClipsAdded: (clips: VideoClip[]) => void;
  maxClips?: number;
  currentClipCount: number;
}

export default function UploadZone({
  onClipsAdded,
  maxClips = 5,
  currentClipCount,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = currentClipCount < maxClips;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!canAddMore) {
      alert(`Maximum ${maxClips} clips allowed`);
      return;
    }

    setIsProcessing(true);

    try {
      const videoFiles = Array.from(files).filter((file) =>
        file.type.startsWith("video/")
      );

      if (videoFiles.length === 0) {
        alert("Please upload video files only");
        setIsProcessing(false);
        return;
      }

      // Limit to remaining slots
      const remainingSlots = maxClips - currentClipCount;
      const filesToProcess = videoFiles.slice(0, remainingSlots);

      const newClips: VideoClip[] = [];

      for (const file of filesToProcess) {
        try {
          // Generate thumbnail and get metadata
          const [thumbnail, metadata] = await Promise.all([
            generateThumbnail(file),
            getVideoMetadata(file),
          ]);

          const clip: VideoClip = {
            id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            name: file.name,
            size: file.size,
            duration: metadata.duration,
            thumbnail,
            createdAt: Date.now(),
            transcript: null,
            transcriptStatus: "pending",
          };

          // Save to IndexedDB
          await clipStorage.saveClip(clip);
          newClips.push(clip);
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
        }
      }

      if (newClips.length > 0) {
        onClipsAdded(newClips);
      }
    } catch (error) {
      console.error("Error processing files:", error);
      alert("Failed to process some files");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleClick = () => {
    if (canAddMore && !isProcessing) {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  if (!canAddMore) {
    return (
      <div className="border-2 border-gray-300 rounded-lg p-8 text-center bg-gray-100">
        <p className="text-sm font-medium text-gray-700">
          Maximum {maxClips} clips reached
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Remove a clip to upload more
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center
          transition-all cursor-pointer
          ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 bg-white"
          }
          ${isProcessing ? "opacity-50 cursor-wait" : ""}
        `}
      >
        <div className="flex flex-col items-center gap-3">
          {isProcessing ? (
            <>
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Processing videos...
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Generating thumbnails and metadata
                </p>
              </div>
            </>
          ) : (
            <>
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Upload video clips
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Drag & drop or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {currentClipCount} / {maxClips} clips uploaded
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
    </>
  );
}
