/**
 * API Endpoint: Upload Assets
 *
 * Accepts uploaded files and saves them to public/assets/ for Remotion's staticFile()
 *
 * POST /api/upload-assets
 * Content-Type: multipart/form-data
 *
 * Body:
 *   file_0, file_1, ... : File objects
 *   type_0, type_1, ... : File types ("image", "video", "audio", "document")
 *
 * Returns:
 * {
 *   success: boolean,
 *   assets: [
 *     {
 *       id: string,
 *       name: string,
 *       type: string,
 *       size: number,
 *       mimeType: string,
 *       publicPath: string  // e.g., "assets/images/photo_0.png"
 *     }
 *   ],
 *   error?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { needsTranscoding, transcodeToMp4 } from "@/lib/transcoding";

// Maximum total upload size: 1GB
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024;

// Allowed MIME types by category
const ALLOWED_MIMES: Record<string, string[]> = {
  image: ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/mov"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/m4a"],
  document: ["application/pdf", "text/plain"],
  logo: ["image/png", "image/svg+xml", "image/webp"],
};

/**
 * Sanitize filename for safe filesystem usage
 */
function sanitizeFilename(name: string): string {
  // Remove path components
  const basename = path.basename(name);

  // Replace unsafe characters with underscores
  return basename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .toLowerCase();
}

/**
 * Get the folder name for an asset type
 */
function getTypeFolder(type: string): string {
  const folders: Record<string, string> = {
    image: "images",
    video: "videos",
    audio: "audio",
    document: "documents",
    logo: "logos",
  };
  return folders[type] || "misc";
}

/**
 * Validate MIME type for the given asset type
 */
function isValidMimeType(mimeType: string, assetType: string): boolean {
  const allowed = ALLOWED_MIMES[assetType] || [];
  return allowed.includes(mimeType);
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType: string, originalName: string): string {
  // First try to get from original filename
  const originalExt = path.extname(originalName).toLowerCase();
  if (originalExt) return originalExt;

  // Fallback to MIME type mapping
  const mimeToExt: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/mov": ".mov",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "audio/m4a": ".m4a",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
  };

  return mimeToExt[mimeType] || "";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Collect all files and their types
    const files: { file: File; type: string; index: number }[] = [];
    let totalSize = 0;

    // Parse form data
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file_") && value instanceof File) {
        const index = parseInt(key.replace("file_", ""), 10);
        const typeKey = `type_${index}`;
        const type = formData.get(typeKey)?.toString() || "document";

        files.push({ file: value, type, index });
        totalSize += value.size;
      }
    }

    // Validate total size
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Total upload size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds maximum (${MAX_TOTAL_SIZE / 1024 / 1024}MB)`,
        },
        { status: 400 }
      );
    }

    // Sort by index to maintain order
    files.sort((a, b) => a.index - b.index);

    // Create base assets directory if needed
    const publicDir = path.join(process.cwd(), "public");
    const assetsDir = path.join(publicDir, "assets");
    await fs.mkdir(assetsDir, { recursive: true });

    // Create type-specific directories
    const typeFolders = new Set(files.map((f) => getTypeFolder(f.type)));
    for (const folder of typeFolders) {
      await fs.mkdir(path.join(assetsDir, folder), { recursive: true });
    }

    // Process and save each file
    const uploadedAssets: {
      id: string;
      name: string;
      type: string;
      size: number;
      mimeType: string;
      publicPath: string;
    }[] = [];

    const timestamp = Date.now();

    for (let i = 0; i < files.length; i++) {
      const { file, type } = files[i];

      // Validate MIME type
      if (!isValidMimeType(file.type, type)) {
        console.warn(
          `[UploadAssets] Skipping file with invalid MIME type: ${file.name} (${file.type} for ${type})`
        );
        continue;
      }

      // Generate safe filename with unique ID (no collisions, no double suffixes)
      const sanitized = sanitizeFilename(file.name);
      const ext = getExtensionFromMime(file.type, file.name);
      const baseName = sanitized.replace(/\.[^.]+$/, ""); // Remove extension
      const uniqueId = nanoid(6); // 6-char unique ID: "a1b2c3"
      const finalName = `${baseName}-${uniqueId}${ext}`;

      // Get folder and path
      const folder = getTypeFolder(type);
      const relativePath = `assets/${folder}/${finalName}`;
      const fullPath = path.join(publicDir, relativePath);

      // Read file data and write to disk
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(fullPath, buffer);

      console.log(`[UploadAssets] Saved: ${relativePath} (${file.size} bytes)`);

      // Check if video needs transcoding (MOV -> MP4)
      let finalPublicPath = relativePath;
      let finalMimeType = file.type;

      if (type === "video" && needsTranscoding(file.type, file.name)) {
        console.log(`[UploadAssets] MOV detected, transcoding to MP4: ${file.name}`);

        const outputDir = path.join(publicDir, "assets", folder);
        const result = await transcodeToMp4(fullPath, outputDir);

        if (result.success) {
          // Update path to point to the new MP4 file
          const mp4Name = path.basename(result.outputPath);
          finalPublicPath = `assets/${folder}/${mp4Name}`;
          finalMimeType = "video/mp4";
          console.log(`[UploadAssets] Transcoded successfully: ${finalPublicPath}`);
        } else {
          console.error(`[UploadAssets] Transcoding failed: ${result.error}`);
          // Keep the original MOV file if transcoding fails
        }
      }

      // Add to results
      uploadedAssets.push({
        id: `asset_${timestamp}_${i}`,
        name: file.name,
        type: type,
        size: file.size,
        mimeType: finalMimeType,
        publicPath: finalPublicPath,
      });
    }

    console.log(
      `[UploadAssets] Successfully uploaded ${uploadedAssets.length} assets`
    );

    return NextResponse.json({
      success: true,
      assets: uploadedAssets,
    });
  } catch (error) {
    console.error("[UploadAssets] Error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/upload-assets
 *
 * List all uploaded assets in public/assets/
 */
export async function GET() {
  try {
    const assetsDir = path.join(process.cwd(), "public", "assets");

    // Check if directory exists
    try {
      await fs.access(assetsDir);
    } catch {
      return NextResponse.json({ success: true, assets: [] });
    }

    // Read all subdirectories
    const folders = await fs.readdir(assetsDir);
    const assets: { name: string; type: string; publicPath: string }[] = [];

    for (const folder of folders) {
      const folderPath = path.join(assetsDir, folder);
      const stat = await fs.stat(folderPath);

      if (stat.isDirectory()) {
        const files = await fs.readdir(folderPath);
        for (const file of files) {
          // Skip hidden files
          if (file.startsWith(".")) continue;

          // Determine type from folder
          const typeMap: Record<string, string> = {
            images: "image",
            videos: "video",
            audio: "audio",
            documents: "document",
            logos: "logo",
          };
          const type = typeMap[folder] || "document";

          assets.push({
            name: file,
            type,
            publicPath: `assets/${folder}/${file}`,
          });
        }
      }
    }

    return NextResponse.json({ success: true, assets });
  } catch (error) {
    console.error("[UploadAssets] Error listing assets:", error);
    const message = error instanceof Error ? error.message : "Failed to list assets";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/upload-assets
 *
 * Delete all uploaded assets (cleanup)
 */
export async function DELETE() {
  try {
    const assetsDir = path.join(process.cwd(), "public", "assets");

    // Remove the entire assets directory
    await fs.rm(assetsDir, { recursive: true, force: true });

    // Recreate empty directory
    await fs.mkdir(assetsDir, { recursive: true });

    console.log("[UploadAssets] Cleared all uploaded assets");

    return NextResponse.json({ success: true, message: "All assets deleted" });
  } catch (error) {
    console.error("[UploadAssets] Error deleting assets:", error);
    const message = error instanceof Error ? error.message : "Failed to delete assets";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
