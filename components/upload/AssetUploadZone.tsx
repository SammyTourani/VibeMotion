"use client";

import { useState, useRef } from "react";
import type { UploadedAsset, AssetType } from "@/lib/types";
import { generateThumbnail, getVideoMetadata } from "@/lib/video-utils";

interface AssetUploadZoneProps {
  onAssetsAdded: (assets: UploadedAsset[]) => void;
  maxAssets?: number;
  currentAssetCount: number;
}

// Determine asset type from MIME type
function getAssetType(mimeType: string): AssetType {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) {
    // Check if it's likely a logo (SVG or small PNG)
    if (mimeType === "image/svg+xml") return "logo";
    return "image";
  }
  return "document";
}

// Generate thumbnail for different asset types
async function generateAssetThumbnail(
  file: File,
  type: AssetType
): Promise<string | null> {
  try {
    if (type === "video") {
      return await generateThumbnail(file);
    }
    if (type === "image" || type === "logo") {
      // For images, create a data URL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    }
    // No thumbnail for audio/documents
    return null;
  } catch {
    return null;
  }
}

// Get metadata for different asset types
async function getAssetMetadata(
  file: File,
  type: AssetType
): Promise<{ width?: number; height?: number; duration?: number }> {
  try {
    if (type === "video") {
      const meta = await getVideoMetadata(file);
      return {
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
      };
    }
    if (type === "image" || type === "logo") {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({ width: img.width, height: img.height });
          URL.revokeObjectURL(img.src);
        };
        img.onerror = () => resolve({});
        img.src = URL.createObjectURL(file);
      });
    }
    if (type === "audio") {
      return new Promise((resolve) => {
        const audio = new Audio();
        audio.onloadedmetadata = () => {
          resolve({ duration: audio.duration });
          URL.revokeObjectURL(audio.src);
        };
        audio.onerror = () => resolve({});
        audio.src = URL.createObjectURL(file);
      });
    }
    return {};
  } catch {
    return {};
  }
}

export default function AssetUploadZone({
  onAssetsAdded,
  maxAssets = 20,
  currentAssetCount,
}: AssetUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = currentAssetCount < maxAssets;
  const remainingSlots = maxAssets - currentAssetCount;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!canAddMore) {
      alert(`Maximum ${maxAssets} assets allowed`);
      return;
    }

    setIsProcessing(true);

    try {
      const fileArray = Array.from(files).slice(0, remainingSlots);
      const newAssets: UploadedAsset[] = [];

      for (const file of fileArray) {
        try {
          const type = getAssetType(file.type);
          const [thumbnail, metadata] = await Promise.all([
            generateAssetThumbnail(file, type),
            getAssetMetadata(file, type),
          ]);

          const asset: UploadedAsset = {
            id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            file,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            thumbnail,
            metadata,
            createdAt: Date.now(),
          };

          newAssets.push(asset);
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
        }
      }

      if (newAssets.length > 0) {
        onAssetsAdded(newAssets);
      }
    } catch (error) {
      console.error("Error processing files:", error);
      alert("Failed to process some files");
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClick = () => {
    if (canAddMore && !isProcessing) {
      fileInputRef.current?.click();
    }
  };

  if (!canAddMore) {
    return (
      <div className="upload-zone opacity-50 cursor-not-allowed">
        <p className="text-gray-400">Maximum {maxAssets} assets reached</p>
        <p className="text-sm text-gray-500 mt-1">Remove assets to add more</p>
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
        className={`upload-zone ${isDragging ? "dragging" : ""} ${isProcessing ? "opacity-50 cursor-wait" : ""}`}
      >
        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <>
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-lg font-medium">Processing assets...</p>
                <p className="text-sm text-gray-500 mt-1">
                  Generating thumbnails and metadata
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div>
                <p className="text-lg font-medium">
                  Drop your assets here
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  or click to browse
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">
                  Images
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">
                  Videos
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">
                  Audio
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">
                  Logos
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {currentAssetCount} / {maxAssets} assets
              </p>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.svg,.pdf"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </>
  );
}
