"use client";

import type { UploadedAsset } from "@/lib/types";
import AssetCard from "./AssetCard";

interface AssetGalleryProps {
  assets: UploadedAsset[];
  onRemoveAsset: (id: string) => void;
}

export default function AssetGallery({
  assets,
  onRemoveAsset,
}: AssetGalleryProps) {
  if (assets.length === 0) {
    return null;
  }

  // Group assets by type
  const groupedAssets = assets.reduce(
    (acc, asset) => {
      if (!acc[asset.type]) {
        acc[asset.type] = [];
      }
      acc[asset.type].push(asset);
      return acc;
    },
    {} as Record<string, UploadedAsset[]>
  );

  const typeOrder = ["video", "image", "logo", "audio", "document"];
  const sortedTypes = Object.keys(groupedAssets).sort(
    (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
  );

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span className="font-medium text-white">{assets.length} assets</span>
        {sortedTypes.map((type) => (
          <span key={type} className="capitalize">
            {groupedAssets[type].length} {type}
            {groupedAssets[type].length !== 1 ? "s" : ""}
          </span>
        ))}
      </div>

      {/* Asset grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} onRemove={onRemoveAsset} />
        ))}
      </div>
    </div>
  );
}
