/**
 * Asset Processing Pipeline
 * Processes uploaded assets for AI consumption and Remotion usage
 */

import type { UploadedAsset, AssetType, ThemeConfig } from "./types";
import {
  generateAssetManifest,
  generateAssetManifestText,
  generateAssetGalleryHTML,
  generateAssetContext,
  type AssetManifest,
} from "./asset-gallery";

/**
 * Processed asset with public path
 */
export interface ProcessedAsset {
  id: string;
  name: string;
  type: AssetType;
  originalFile: File;
  publicPath: string; // Path for staticFile() in Remotion
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    fileSize: number;
    mimeType: string;
  };
}

/**
 * Complete asset context for AI
 */
export interface AssetContext {
  manifest: AssetManifest;
  manifestText: string;
  galleryHTML: string;
  processedAssets: ProcessedAsset[];
  systemPromptContext: string;
}

/**
 * Sanitize filename for safe file system usage
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Generate a unique public path for an asset
 * If the asset already has a publicPath (from upload API), use that instead
 */
function generatePublicPath(asset: UploadedAsset, index: number): string {
  // IMPORTANT: If asset already has publicPath from upload API, use it directly
  // This prevents double-suffix issues (e.g., img_7335_0_0.mov)
  if (asset.publicPath) {
    return asset.publicPath;
  }

  // Fallback: generate path for assets without one
  const sanitized = sanitizeFilename(asset.name);
  const folder = `${asset.type}s`;

  const nameParts = sanitized.split(".");
  const ext = nameParts.length > 1 ? nameParts.pop() : "";
  const baseName = nameParts.join(".");

  return `assets/${folder}/${baseName}_${index}.${ext}`;
}

/**
 * Process a single asset
 */
function processAsset(asset: UploadedAsset, index: number): ProcessedAsset {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    originalFile: asset.file,
    publicPath: generatePublicPath(asset, index),
    metadata: {
      width: asset.metadata.width,
      height: asset.metadata.height,
      duration: asset.metadata.duration,
      fileSize: asset.size,
      mimeType: asset.mimeType,
    },
  };
}

/**
 * Generate system prompt context for Claude
 * This provides Claude with all the information needed to use the assets
 */
function generateSystemPromptContext(
  assets: UploadedAsset[],
  theme: ThemeConfig,
  processedAssets: ProcessedAsset[]
): string {
  const manifestText = generateAssetManifestText(assets);

  const themeContext = `
## Video Theme Configuration

- **Style**: ${theme.style}
- **Aspect Ratio**: ${theme.aspectRatio}
- **Primary Color**: ${theme.primaryColor}
- **Secondary Color**: ${theme.secondaryColor}
- **Background Color**: ${theme.backgroundColor}
- **Text Color**: ${theme.textColor}
- **Font**: ${theme.fontFamily}
`;

  const usageContext = `
## Asset Usage in Remotion

To use these assets in your Remotion composition, import them using \`staticFile()\`:

\`\`\`tsx
import { staticFile } from 'remotion';

// Example usage:
<Img src={staticFile('assets/images/example.png')} />
<Video src={staticFile('assets/videos/clip.mp4')} />
<Audio src={staticFile('assets/audio/music.mp3')} />
\`\`\`

### Asset Paths for This Project:
${processedAssets.map((a) => `- ${a.name}: \`staticFile('${a.publicPath}')\``).join("\n")}
`;

  return `${manifestText}\n${themeContext}\n${usageContext}`;
}

/**
 * Process all assets for AI consumption
 * This is the main entry point for the asset processing pipeline
 */
export async function processAssets(
  assets: UploadedAsset[],
  theme: ThemeConfig
): Promise<AssetContext> {
  // Process each asset
  const processedAssets = assets.map((asset, index) => processAsset(asset, index));

  // Generate manifest
  const manifest = generateAssetManifest(assets);

  // Generate text manifest
  const manifestText = generateAssetManifestText(assets);

  // Generate HTML gallery
  const galleryHTML = generateAssetGalleryHTML(assets, {
    title: "Project Assets",
    showPaths: true,
    darkMode: true,
  });

  // Generate system prompt context
  const systemPromptContext = generateSystemPromptContext(
    assets,
    theme,
    processedAssets
  );

  return {
    manifest,
    manifestText,
    galleryHTML,
    processedAssets,
    systemPromptContext,
  };
}

/**
 * Generate the AI context bundle for API calls
 * Returns a compact version suitable for sending to Claude API
 */
export function generateAIContext(
  assets: UploadedAsset[],
  theme: ThemeConfig,
  userPrompt: string
): {
  systemContext: string;
  assetSummary: string;
  fullContext: string;
} {
  const { manifest, text } = generateAssetContext(assets);

  const assetSummary = manifest.summary;

  const systemContext = `You are helping create a video using Remotion. The user has provided assets and a description of their desired video.

## Project Configuration
- Style: ${theme.style}
- Aspect Ratio: ${theme.aspectRatio} (${getAspectDimensions(theme.aspectRatio)})
- Colors: Primary ${theme.primaryColor}, Secondary ${theme.secondaryColor}

${text}`;

  const fullContext = `${systemContext}

## User's Video Description
${userPrompt}`;

  return {
    systemContext,
    assetSummary,
    fullContext,
  };
}

/**
 * Get pixel dimensions for aspect ratio
 */
function getAspectDimensions(aspectRatio: string): string {
  const dimensions: Record<string, string> = {
    "9:16": "1080x1920 - Vertical/TikTok/Reels",
    "16:9": "1920x1080 - Landscape/YouTube",
    "1:1": "1080x1080 - Square/Instagram",
    "4:5": "1080x1350 - Portrait/Instagram",
  };
  return dimensions[aspectRatio] || "1920x1080";
}

/**
 * Get dimensions in pixels for rendering
 */
export function getVideoDimensions(aspectRatio: string): { width: number; height: number } {
  const dims: Record<string, { width: number; height: number }> = {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
  };
  return dims[aspectRatio] || { width: 1920, height: 1080 };
}

/**
 * Validate assets before processing
 * Returns validation errors if any
 */
export function validateAssets(assets: UploadedAsset[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for at least one asset
  if (assets.length === 0) {
    warnings.push("No assets uploaded. AI will generate a video using only text and generated content.");
  }

  // Check for very large files
  const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
  assets.forEach((asset) => {
    if (asset.size > MAX_FILE_SIZE) {
      errors.push(`Asset "${asset.name}" is too large (${(asset.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 1GB.`);
    }
  });

  // Check for supported formats
  const supportedMimes: Record<AssetType, string[]> = {
    image: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
    video: ["video/mp4", "video/webm", "video/quicktime"],
    audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"],
    logo: ["image/png", "image/svg+xml", "image/webp"],
    document: ["application/pdf", "text/plain"],
  };

  assets.forEach((asset) => {
    const supported = supportedMimes[asset.type] || [];
    if (!supported.includes(asset.mimeType)) {
      warnings.push(`Asset "${asset.name}" has unsupported format (${asset.mimeType}). It may not render correctly.`);
    }
  });

  // Check for missing metadata
  assets.forEach((asset) => {
    if ((asset.type === "image" || asset.type === "logo") && !asset.metadata.width) {
      warnings.push(`Asset "${asset.name}" is missing dimension metadata.`);
    }
    if ((asset.type === "video" || asset.type === "audio") && !asset.metadata.duration) {
      warnings.push(`Asset "${asset.name}" is missing duration metadata.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculate estimated video duration based on assets
 */
export function estimateVideoDuration(assets: UploadedAsset[]): {
  minSeconds: number;
  maxSeconds: number;
  recommended: number;
} {
  // Count content items
  const imageCount = assets.filter((a) => a.type === "image" || a.type === "logo").length;
  const videoSeconds = assets
    .filter((a) => a.type === "video")
    .reduce((sum, a) => sum + (a.metadata.duration || 0), 0);
  const audioSeconds = assets
    .filter((a) => a.type === "audio")
    .reduce((sum, a) => sum + (a.metadata.duration || 0), 0);

  // Estimate based on content
  // Images: 2-4 seconds each
  // Videos: use actual duration
  // Audio: might dictate total length

  const minFromImages = imageCount * 2;
  const maxFromImages = imageCount * 4;

  const minSeconds = Math.max(5, minFromImages + videoSeconds);
  const maxSeconds = Math.max(15, maxFromImages + videoSeconds, audioSeconds);
  const recommended = Math.round((minSeconds + maxSeconds) / 2);

  return { minSeconds, maxSeconds, recommended };
}
