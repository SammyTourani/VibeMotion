"use client";

import type { UploadedAsset } from "@/lib/types";
import { formatFileSize, formatDuration } from "@/lib/video-utils";

interface AssetCardProps {
  asset: UploadedAsset;
  onRemove: (id: string) => void;
}

// Get icon for asset type
function AssetIcon({ type }: { type: UploadedAsset["type"] }) {
  switch (type) {
    case "video":
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    case "audio":
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      );
    case "image":
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case "logo":
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
      );
    default:
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
  }
}

// Get color for asset type
function getTypeColor(type: UploadedAsset["type"]): string {
  switch (type) {
    case "video":
      return "text-purple-400 bg-purple-500/20";
    case "audio":
      return "text-cyan-400 bg-cyan-500/20";
    case "image":
      return "text-orange-400 bg-orange-500/20";
    case "logo":
      return "text-green-400 bg-green-500/20";
    default:
      return "text-gray-400 bg-gray-500/20";
  }
}

export default function AssetCard({ asset, onRemove }: AssetCardProps) {
  const typeColor = getTypeColor(asset.type);

  return (
    <div className="asset-card group">
      {/* Thumbnail area */}
      <div className="relative aspect-square bg-black/50 flex items-center justify-center overflow-hidden">
        {asset.thumbnail ? (
          <img
            src={asset.thumbnail}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`p-4 rounded-xl ${typeColor}`}>
            <AssetIcon type={asset.type} />
          </div>
        )}

        {/* Type badge */}
        <div
          className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium capitalize ${typeColor}`}
        >
          {asset.type}
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(asset.id);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Duration overlay for video/audio */}
        {asset.metadata.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-xs">
            {formatDuration(asset.metadata.duration)}
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="p-3">
        <p className="text-sm font-medium truncate" title={asset.name}>
          {asset.name}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          <span>{formatFileSize(asset.size)}</span>
          {asset.metadata.width && asset.metadata.height && (
            <>
              <span className="w-1 h-1 bg-gray-600 rounded-full" />
              <span>
                {asset.metadata.width}x{asset.metadata.height}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
