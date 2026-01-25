# Feature 2: Asset Upload & Storage - Implementation Plan

**Status:** Planning
**Priority:** HIGH
**Dependencies:** Feature 1 (File System Integration) ✅

---

## Problem Statement

Currently, when users upload assets on the landing page:
1. Files are stored in browser memory (React state)
2. Only metadata (name, type, size) is saved to sessionStorage
3. Generated Remotion code references paths like `staticFile('assets/images/photo_0.png')`
4. **But those files don't exist on the server** → Generated code won't work

---

## Solution Overview

Create an API endpoint that:
1. Accepts uploaded files via FormData
2. Saves them to `public/assets/{type}s/` directory
3. Returns the public paths for use in Remotion's `staticFile()`

Update the frontend to:
1. Upload files to the server before navigating to sandbox
2. Pass server-side paths to the generation API
3. Generated code will reference actual existing files

---

## Current Flow (Broken)

```
[Landing Page]
    ↓
User uploads files → Stored in React state (browser memory)
    ↓
Click "Generate" → sessionStorage.setItem('pendingProject', {
    prompt: "...",
    files: [{ name, type, size }]  // ← NO ACTUAL FILE DATA
})
    ↓
[Sandbox Page]
    ↓
Reads sessionStorage → Has metadata but NO files
    ↓
[/api/generate-stream]
    ↓
Generates code with: staticFile('assets/images/photo_0.png')
    ↓
❌ FILES DON'T EXIST IN public/assets/
```

---

## New Flow (Working)

```
[Landing Page]
    ↓
User uploads files → Stored in React state
    ↓
Click "Generate" → POST /api/upload-assets (multipart/form-data)
    ↓
[Server]
    ↓
Saves files to: public/assets/{type}s/{sanitized_name}
Returns: [{ name, type, size, publicPath: "assets/images/photo_0.png" }]
    ↓
sessionStorage.setItem('pendingProject', {
    prompt: "...",
    files: [{ name, type, size, publicPath }]  // ← NOW HAS PATHS
})
    ↓
[Sandbox Page]
    ↓
Reads sessionStorage → Has metadata AND paths
    ↓
[/api/generate-stream]
    ↓
Generates code with: staticFile('assets/images/photo_0.png')
    ↓
✅ FILES EXIST IN public/assets/
```

---

## Implementation Steps

### Step 2.1: Create `/api/upload-assets` Endpoint

**File:** `app/api/upload-assets/route.ts`

**Functionality:**
- Accept `multipart/form-data` with multiple files
- Create `public/assets/` directory structure if needed
- Save each file to `public/assets/{type}s/{sanitized_name}`
- Return array of uploaded file info with public paths

**Input:**
```
POST /api/upload-assets
Content-Type: multipart/form-data

files: File[]
```

**Output:**
```json
{
  "success": true,
  "assets": [
    {
      "id": "asset_1706123456789_0",
      "name": "photo.png",
      "type": "image",
      "size": 123456,
      "mimeType": "image/png",
      "publicPath": "assets/images/photo_0.png"
    }
  ]
}
```

**Edge Cases:**
- Sanitize filenames (remove special characters)
- Handle name collisions (add index suffix)
- Validate file types
- Limit total upload size (100MB)
- Create directories if they don't exist

---

### Step 2.2: Update Landing Page (HeroSection.tsx)

**Changes:**
1. On "Generate" click, upload files to server FIRST
2. Wait for upload to complete
3. Store returned paths in sessionStorage
4. Then navigate to sandbox

**Current Code (line 90-108):**
```tsx
const handleGenerate = async () => {
  if (!prompt.trim()) return;
  setIsGenerating(true);

  const projectData = {
    prompt,
    files: files.map((f) => ({
      name: f.file.name,
      type: f.type,
      size: f.file.size,
    })),
    timestamp: Date.now(),
  };
  sessionStorage.setItem("pendingProject", JSON.stringify(projectData));
  router.push("/sandbox");
};
```

**New Code:**
```tsx
const handleGenerate = async () => {
  if (!prompt.trim()) return;
  setIsGenerating(true);

  let uploadedAssets: UploadedAssetInfo[] = [];

  // Upload files to server if any
  if (files.length > 0) {
    const formData = new FormData();
    files.forEach((f, i) => {
      formData.append(`file_${i}`, f.file);
      formData.append(`type_${i}`, f.type);
    });

    const uploadResponse = await fetch('/api/upload-assets', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      // Handle error
      setIsGenerating(false);
      return;
    }

    const uploadResult = await uploadResponse.json();
    uploadedAssets = uploadResult.assets;
  }

  const projectData = {
    prompt,
    files: uploadedAssets,  // Now has publicPath!
    timestamp: Date.now(),
  };
  sessionStorage.setItem("pendingProject", JSON.stringify(projectData));
  router.push("/sandbox");
};
```

---

### Step 2.3: Update Sandbox Page

**File:** `app/sandbox/page.tsx`

**Changes:**
- Pass uploaded asset paths to `/api/generate-stream`
- The assets array now includes `publicPath` for each file

**Current Code (around line 147-162):**
```tsx
const response = await fetch("/api/generate-stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: `project-${Date.now()}`,
    prompt,
    assets: [],  // ← Currently empty!
    theme: { ... },
  }),
});
```

**New Code:**
```tsx
// Convert file info to UploadedAsset format
const assets = projectData.files.map((f: any) => ({
  id: f.id,
  type: f.type,
  name: f.name,
  size: f.size,
  mimeType: f.mimeType,
  publicPath: f.publicPath,
  // ... other fields
}));

const response = await fetch("/api/generate-stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: `project-${Date.now()}`,
    prompt,
    assets: assets,  // ← Now has real asset info!
    theme: { ... },
  }),
});
```

---

### Step 2.4: Update Generate-Stream API

**File:** `app/api/generate-stream/route.ts`

**Changes:**
- Use asset `publicPath` in the system prompt
- Tell Claude exactly which paths to use

**Current behavior:**
- `asset-processor.ts` generates theoretical paths but files don't exist

**New behavior:**
- Use actual uploaded file paths in the prompt
- Claude generates code with real, existing file paths

---

## Directory Structure After Implementation

```
public/
├── assets/
│   ├── images/
│   │   ├── photo_0.png
│   │   └── logo_1.png
│   ├── videos/
│   │   └── clip_0.mp4
│   ├── audio/
│   │   └── music_0.mp3
│   └── documents/
│       └── script_0.pdf
├── audio/          # Existing (for examples)
├── casts/          # Existing
├── diagrams/       # Existing
├── images/         # Existing
└── videos/         # Existing
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Large file uploads slow down UX | Medium | Medium | Show upload progress, limit file size |
| Disk space exhaustion | Low | High | Implement cleanup of old assets |
| Filename collisions | Medium | Low | Add unique suffix to filenames |
| Security (malicious files) | Medium | High | Validate MIME types, scan if needed |

---

## Testing Plan

1. **Unit Tests:**
   - Filename sanitization
   - Path generation
   - File type validation

2. **Integration Tests:**
   - Upload single image → verify file exists
   - Upload multiple files → verify all exist
   - Upload with special characters in name → verify sanitized

3. **E2E Tests:**
   - Upload assets on landing → generate → verify generated code uses correct paths
   - Open Remotion Studio → verify assets load

---

## Rollback Plan

If issues arise:
1. Assets stored in `public/assets/` can be manually deleted
2. No database changes, pure filesystem
3. Landing page change is isolated to upload flow

---

## Estimated Effort

| Step | Complexity | Estimated Time |
|------|------------|----------------|
| 2.1: Create API endpoint | Medium | 30 min |
| 2.2: Update landing page | Low | 20 min |
| 2.3: Update sandbox page | Low | 15 min |
| 2.4: Update generate API | Low | 15 min |
| Testing | Medium | 30 min |
| **Total** | | **~2 hours** |

---

## Approval Checklist

- [ ] Implementation plan reviewed
- [ ] No breaking changes to existing features
- [ ] Backwards compatible (assets optional)
- [ ] Security considerations addressed
- [ ] Testing plan adequate

---

**Ready for implementation?**
