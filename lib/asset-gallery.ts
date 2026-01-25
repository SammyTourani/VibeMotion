/**
 * Asset Gallery Generator
 * Creates visual and text context for AI consumption
 * This is the "secret sauce" - giving Claude visual context of all available assets
 */

import type { UploadedAsset, AssetType } from "./types";

/**
 * Asset manifest entry with all relevant info for AI
 */
export interface AssetManifestEntry {
  id: string;
  name: string;
  type: AssetType;
  path: string; // Path that will be used in Remotion (e.g., staticFile('assets/...'))
  description: string;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    fileSize: string;
    mimeType: string;
  };
}

/**
 * Complete asset manifest for AI context
 */
export interface AssetManifest {
  totalAssets: number;
  byType: Record<AssetType, number>;
  entries: AssetManifestEntry[];
  summary: string;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format duration in seconds to readable format
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Generate a text description of an asset for AI context
 */
function describeAsset(asset: UploadedAsset): string {
  const parts: string[] = [];

  // Type and name
  const typeLabel = {
    image: "Image",
    video: "Video clip",
    audio: "Audio file",
    logo: "Logo",
    document: "Document",
  }[asset.type];

  parts.push(`${typeLabel}: "${asset.name}"`);

  // Dimensions for images/videos/logos
  if (asset.metadata.width && asset.metadata.height) {
    parts.push(`${asset.metadata.width}x${asset.metadata.height}px`);
  }

  // Duration for audio/video
  if (asset.metadata.duration) {
    parts.push(`duration: ${formatDuration(asset.metadata.duration)}`);
  }

  // File size
  parts.push(formatFileSize(asset.size));

  return parts.join(", ");
}

/**
 * Generate text manifest of all assets
 * This gives Claude a structured list of available assets
 */
export function generateAssetManifest(assets: UploadedAsset[]): AssetManifest {
  const byType: Record<AssetType, number> = {
    image: 0,
    video: 0,
    audio: 0,
    logo: 0,
    document: 0,
  };

  const entries: AssetManifestEntry[] = assets.map((asset) => {
    byType[asset.type]++;

    // Use the actual publicPath from upload API if available, otherwise generate a fallback
    // This ensures the AI gets the correct path that matches the uploaded file on disk
    let path: string;
    if (asset.publicPath) {
      path = asset.publicPath;
    } else {
      // Fallback: generate path (may not match actual uploaded filename)
      const sanitizedName = asset.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      path = `assets/${asset.type}s/${sanitizedName}`;
    }

    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      path,
      description: describeAsset(asset),
      metadata: {
        width: asset.metadata.width,
        height: asset.metadata.height,
        duration: asset.metadata.duration,
        fileSize: formatFileSize(asset.size),
        mimeType: asset.mimeType,
      },
    };
  });

  // Generate summary text
  const typeCounts = Object.entries(byType)
    .filter((entry) => entry[1] > 0)
    .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
    .join(", ");

  const summary =
    assets.length === 0
      ? "No assets uploaded yet."
      : `${assets.length} assets available: ${typeCounts}.`;

  return {
    totalAssets: assets.length,
    byType,
    entries,
    summary,
  };
}

/**
 * Generate formatted text manifest for AI system prompt
 */
export function generateAssetManifestText(assets: UploadedAsset[]): string {
  const manifest = generateAssetManifest(assets);

  if (manifest.totalAssets === 0) {
    return "No assets have been uploaded.";
  }

  const lines: string[] = [
    "## Available Assets",
    "",
    manifest.summary,
    "",
  ];

  // Group by type
  const typeOrder: AssetType[] = ["logo", "image", "video", "audio", "document"];

  for (const type of typeOrder) {
    const typeAssets = manifest.entries.filter((e) => e.type === type);
    if (typeAssets.length === 0) continue;

    const typeLabel = {
      image: "Images",
      video: "Videos",
      audio: "Audio Files",
      logo: "Logos",
      document: "Documents",
    }[type];

    lines.push(`### ${typeLabel}`);

    typeAssets.forEach((entry, i) => {
      // Lead with the EXACT path to use - this is what the AI should copy
      lines.push(`${i + 1}. \`${entry.path}\``);
      lines.push(`   - Use: \`staticFile('${entry.path}')\``);
      if (entry.metadata.width && entry.metadata.height) {
        lines.push(`   - Dimensions: ${entry.metadata.width}x${entry.metadata.height}px`);
      }
      if (entry.metadata.duration) {
        lines.push(`   - Duration: ${formatDuration(entry.metadata.duration)}`);
      }
      lines.push(`   - Size: ${entry.metadata.fileSize}`);
    });

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate HTML gallery of assets
 * This can be rendered and screenshotted for visual AI context
 */
export function generateAssetGalleryHTML(
  assets: UploadedAsset[],
  options: {
    title?: string;
    showPaths?: boolean;
    darkMode?: boolean;
  } = {}
): string {
  const { title = "Asset Gallery", showPaths = true, darkMode = true } = options;

  const bgColor = darkMode ? "#0f0f0f" : "#ffffff";
  const textColor = darkMode ? "#ffffff" : "#000000";
  const cardBg = darkMode ? "#1a1a1a" : "#f5f5f5";
  const borderColor = darkMode ? "#333" : "#ddd";

  // Group assets by type
  const grouped: Record<AssetType, UploadedAsset[]> = {
    logo: [],
    image: [],
    video: [],
    audio: [],
    document: [],
  };

  assets.forEach((asset) => {
    grouped[asset.type].push(asset);
  });

  const typeLabels: Record<AssetType, string> = {
    logo: "Logos",
    image: "Images",
    video: "Videos",
    audio: "Audio",
    document: "Documents",
  };

  const typeIcons: Record<AssetType, string> = {
    logo: "🎨",
    image: "🖼️",
    video: "🎬",
    audio: "🎵",
    document: "📄",
  };

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bgColor};
      color: ${textColor};
      padding: 24px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .summary {
      color: #888;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 18px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .card {
      background: ${cardBg};
      border: 1px solid ${borderColor};
      border-radius: 8px;
      overflow: hidden;
    }
    .preview {
      width: 100%;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${darkMode ? "#111" : "#eee"};
      overflow: hidden;
    }
    .preview img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .preview .icon {
      font-size: 48px;
      opacity: 0.5;
    }
    .info {
      padding: 12px;
    }
    .name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .path {
      font-family: monospace;
      font-size: 11px;
      color: #888;
      word-break: break-all;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="summary">${assets.length} asset${assets.length !== 1 ? "s" : ""} available for video generation</p>
`;

  const typeOrder: AssetType[] = ["logo", "image", "video", "audio", "document"];

  for (const type of typeOrder) {
    const typeAssets = grouped[type];
    if (typeAssets.length === 0) continue;

    html += `
  <div class="section">
    <h2 class="section-title">${typeIcons[type]} ${typeLabels[type]} (${typeAssets.length})</h2>
    <div class="grid">
`;

    for (const asset of typeAssets) {
      // Use the actual publicPath if available
      let path: string;
      if (asset.publicPath) {
        path = asset.publicPath;
      } else {
        const sanitizedName = asset.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        path = `assets/${asset.type}s/${sanitizedName}`;
      }

      // Preview content
      let previewContent = "";
      if (asset.thumbnail && (type === "image" || type === "logo" || type === "video")) {
        previewContent = `<img src="${asset.thumbnail}" alt="${asset.name}" />`;
      } else {
        previewContent = `<span class="icon">${typeIcons[type]}</span>`;
      }

      // Metadata
      const metaParts: string[] = [];
      if (asset.metadata.width && asset.metadata.height) {
        metaParts.push(`${asset.metadata.width}x${asset.metadata.height}`);
      }
      if (asset.metadata.duration) {
        metaParts.push(formatDuration(asset.metadata.duration));
      }
      metaParts.push(formatFileSize(asset.size));

      html += `
      <div class="card">
        <div class="preview">${previewContent}</div>
        <div class="info">
          <div class="name" title="${asset.name}">${asset.name}</div>
          ${showPaths ? `<div class="path">staticFile('${path}')</div>` : ""}
          <div class="meta">${metaParts.join(" • ")}</div>
        </div>
      </div>
`;
    }

    html += `
    </div>
  </div>
`;
  }

  html += `
</body>
</html>
`;

  return html;
}

/**
 * Generate a compact JSON representation for API context
 */
export function generateAssetContext(assets: UploadedAsset[]): {
  manifest: AssetManifest;
  text: string;
  json: object;
} {
  const manifest = generateAssetManifest(assets);
  const text = generateAssetManifestText(assets);

  // Compact JSON for API calls (no thumbnails, just essential info)
  const json = {
    totalAssets: manifest.totalAssets,
    assets: manifest.entries.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      path: e.path,
      ...e.metadata,
    })),
  };

  return { manifest, text, json };
}
