# Feature 4: Render Trigger API - Implementation Plan

**Status:** Planning
**Priority:** MEDIUM
**Dependencies:** Feature 3 (Live Remotion Player) ✅

---

## Problem Statement

Currently, after video generation completes:
1. Users can preview the video in the sandbox (Feature 3 ✅)
2. BUT there's no way to export/download the final video
3. The "Render Video" button in the sandbox header does nothing
4. Users would have to manually run `pnpm exec remotion render` from CLI

**Goal:** Enable one-click video rendering from the sandbox, with progress tracking and download.

---

## Technical Analysis

### How Remotion Rendering Works

The Remotion CLI renders videos using:
```bash
npx remotion render <entry-point> <composition-id> <output-location> --props='<json>'
```

Key requirements:
1. **Composition must be registered** in `Root.tsx` via `<Composition>` component
2. **Entry point** is `src/index.ts` (standard Remotion setup)
3. **Props** can be passed via `--props` flag as JSON
4. **Output** is written to specified path (or `out/` by default)

### Current State

- ✅ `DynamicPreview` composition exists (renders storyboard data)
- ❌ `DynamicPreview` is NOT registered in `Root.tsx`
- ❌ No render API endpoints exist
- ❌ "Render Video" button has no functionality

### Solution Architecture

```
[Sandbox Page]
     ↓
Click "Render Video"
     ↓
POST /api/render { storyboard, aspectRatio, theme }
     ↓
[Server]
     ├── Generate unique render ID
     ├── Save storyboard to temp props file
     ├── Spawn: npx remotion render src/index.ts DynamicPreview-{aspectRatio} out/{renderId}.mp4 --props=./temp/{renderId}.json
     └── Return renderId immediately
     ↓
[Client polls /api/render-status?id={renderId}]
     ↓
[Server parses stdout for progress %]
     ↓
When complete: { status: "complete", url: "/renders/{renderId}.mp4" }
     ↓
[Client shows download button]
```

---

## Implementation Plan

### Step 4.1: Register DynamicPreview in Root.tsx

The `DynamicPreview` composition needs to be registered so Remotion CLI can find it.

**Challenge:** DynamicPreview needs dynamic duration based on storyboard. Solution: Use `calculateMetadata` prop.

**File:** `src/Root.tsx`

```tsx
// Add import
import { DynamicPreview, type DynamicPreviewProps } from "./compositions/dynamic-preview";
import { z } from "zod";

// Create schema for props validation
const dynamicPreviewSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    type: z.string(),
    duration: z.number(),
    description: z.string(),
    text: z.string().optional(),
    assets: z.array(z.string()).optional(),
    voiceover: z.string().optional(),
    animation: z.string().optional(),
    order: z.number().optional(),
  })),
  totalDuration: z.number(),
  theme: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string().optional(),
    backgroundColor: z.string(),
    textColor: z.string(),
    style: z.string().optional(),
  }),
});

// Add composition for each aspect ratio
<Folder name="Generated">
  <Composition
    id="DynamicPreview-Portrait"
    component={DynamicPreview}
    durationInFrames={60} // Default, overridden by calculateMetadata
    fps={60}
    width={1080}
    height={1920}
    schema={dynamicPreviewSchema}
    calculateMetadata={async ({ props }) => {
      const totalDuration = props.totalDuration || 30;
      return {
        durationInFrames: Math.ceil(totalDuration * 60),
      };
    }}
    defaultProps={{
      scenes: [],
      totalDuration: 30,
      theme: {
        primaryColor: "#8B5CF6",
        backgroundColor: "#000000",
        textColor: "#FFFFFF",
      },
    }}
  />
  <Composition
    id="DynamicPreview-Landscape"
    component={DynamicPreview}
    durationInFrames={60}
    fps={60}
    width={1920}
    height={1080}
    schema={dynamicPreviewSchema}
    calculateMetadata={async ({ props }) => {
      const totalDuration = props.totalDuration || 30;
      return {
        durationInFrames: Math.ceil(totalDuration * 60),
      };
    }}
    defaultProps={{...}}
  />
  <Composition
    id="DynamicPreview-Square"
    ...
  />
</Folder>
```

---

### Step 4.2: Create `/api/render` Endpoint

**File:** `app/api/render/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

interface RenderRequest {
  storyboard: {
    scenes: Array<{...}>;
    totalDuration: number;
    summary: string;
  };
  aspectRatio: "9:16" | "16:9" | "1:1";
  theme: {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
  };
}

// Store for tracking render progress
const renderJobs = new Map<string, {
  status: "pending" | "rendering" | "complete" | "error";
  progress: number;
  outputPath: string | null;
  error: string | null;
  startedAt: Date;
}>();

export async function POST(request: NextRequest) {
  const body: RenderRequest = await request.json();
  const { storyboard, aspectRatio, theme } = body;

  // Generate unique render ID
  const renderId = randomUUID().slice(0, 8);

  // Map aspect ratio to composition ID
  const compositionMap = {
    "9:16": "DynamicPreview-Portrait",
    "16:9": "DynamicPreview-Landscape",
    "1:1": "DynamicPreview-Square",
  };
  const compositionId = compositionMap[aspectRatio] || "DynamicPreview-Portrait";

  // Ensure directories exist
  const tempDir = path.join(process.cwd(), "temp");
  const rendersDir = path.join(process.cwd(), "public", "renders");
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(rendersDir, { recursive: true });

  // Write props to temp file (required for Windows compatibility)
  const propsPath = path.join(tempDir, `${renderId}-props.json`);
  const props = {
    scenes: storyboard.scenes,
    totalDuration: storyboard.totalDuration,
    theme,
  };
  await fs.writeFile(propsPath, JSON.stringify(props), "utf-8");

  // Output path
  const outputPath = path.join(rendersDir, `${renderId}.mp4`);
  const publicUrl = `/renders/${renderId}.mp4`;

  // Initialize job tracking
  renderJobs.set(renderId, {
    status: "pending",
    progress: 0,
    outputPath: null,
    error: null,
    startedAt: new Date(),
  });

  // Spawn Remotion render process
  const remotionProcess = spawn("pnpm", [
    "exec", "remotion", "render",
    "src/index.ts",
    compositionId,
    outputPath,
    `--props=${propsPath}`,
    "--log=verbose",
  ], {
    cwd: process.cwd(),
    env: { ...process.env },
  });

  // Track progress from stdout
  remotionProcess.stdout.on("data", (data) => {
    const output = data.toString();
    console.log(`[Render ${renderId}] ${output}`);

    // Parse progress from Remotion output
    // Example: "Rendering frame 120/600 (20%)"
    const progressMatch = output.match(/(\d+)%/);
    if (progressMatch) {
      const progress = parseInt(progressMatch[1], 10);
      const job = renderJobs.get(renderId);
      if (job) {
        job.status = "rendering";
        job.progress = progress;
      }
    }
  });

  remotionProcess.stderr.on("data", (data) => {
    console.error(`[Render ${renderId}] stderr: ${data}`);
  });

  remotionProcess.on("close", async (code) => {
    const job = renderJobs.get(renderId);
    if (job) {
      if (code === 0) {
        job.status = "complete";
        job.progress = 100;
        job.outputPath = publicUrl;
      } else {
        job.status = "error";
        job.error = `Render process exited with code ${code}`;
      }
    }

    // Cleanup temp props file
    try {
      await fs.unlink(propsPath);
    } catch {}
  });

  return NextResponse.json({
    success: true,
    renderId,
    message: "Render started",
  });
}

// GET: Check render status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const renderId = searchParams.get("id");

  if (!renderId) {
    return NextResponse.json({ error: "Missing render ID" }, { status: 400 });
  }

  const job = renderJobs.get(renderId);
  if (!job) {
    return NextResponse.json({ error: "Render job not found" }, { status: 404 });
  }

  return NextResponse.json({
    renderId,
    status: job.status,
    progress: job.progress,
    outputPath: job.outputPath,
    error: job.error,
  });
}
```

---

### Step 4.3: Create Render Status Polling Hook

**File:** `hooks/useRenderStatus.ts`

```typescript
import { useState, useEffect, useCallback } from "react";

interface RenderStatus {
  status: "idle" | "pending" | "rendering" | "complete" | "error";
  progress: number;
  outputPath: string | null;
  error: string | null;
}

export function useRenderStatus(renderId: string | null) {
  const [status, setStatus] = useState<RenderStatus>({
    status: "idle",
    progress: 0,
    outputPath: null,
    error: null,
  });

  useEffect(() => {
    if (!renderId) return;

    setStatus({ status: "pending", progress: 0, outputPath: null, error: null });

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/render?id=${renderId}`);
        const data = await response.json();

        setStatus({
          status: data.status,
          progress: data.progress,
          outputPath: data.outputPath,
          error: data.error,
        });

        // Stop polling when complete or error
        if (data.status === "complete" || data.status === "error") {
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error("Failed to poll render status:", error);
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [renderId]);

  return status;
}
```

---

### Step 4.4: Update Sandbox Page UI

**File:** `app/sandbox/page.tsx` (modifications)

1. Add render state
2. Wire up "Render Video" button
3. Show progress and download button

```tsx
// Add state
const [renderId, setRenderId] = useState<string | null>(null);
const [renderProgress, setRenderProgress] = useState(0);
const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "complete" | "error">("idle");
const [renderUrl, setRenderUrl] = useState<string | null>(null);

// Handle render click
const handleRender = async () => {
  if (!storyboard) return;

  setRenderStatus("rendering");
  setRenderProgress(0);

  const response = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storyboard,
      aspectRatio: "9:16",
      theme: {
        primaryColor: "#8B5CF6",
        backgroundColor: "#000000",
        textColor: "#FFFFFF",
      },
    }),
  });

  const data = await response.json();
  if (data.success) {
    setRenderId(data.renderId);
    // Start polling for progress...
  }
};

// Update render button
{status === "complete" && (
  <motion.button
    onClick={handleRender}
    disabled={renderStatus === "rendering"}
    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg text-sm font-medium"
  >
    {renderStatus === "rendering" ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin" />
        Rendering {renderProgress}%
      </>
    ) : renderStatus === "complete" ? (
      <a href={renderUrl} download className="flex items-center gap-2">
        <Download className="w-4 h-4" />
        Download Video
      </a>
    ) : (
      <>
        <Download className="w-4 h-4" />
        Render Video
      </>
    )}
  </motion.button>
)}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/Root.tsx` | MODIFY | Register DynamicPreview compositions for each aspect ratio |
| `app/api/render/route.ts` | CREATE | POST to start render, GET to check status |
| `hooks/useRenderStatus.ts` | CREATE | Polling hook for render progress |
| `app/sandbox/page.tsx` | MODIFY | Wire up render button with progress/download |
| `public/renders/` | CREATE (dir) | Output directory for rendered videos |
| `temp/` | CREATE (dir) | Temporary props files during render |

---

## Render Job Lifecycle

```
1. User clicks "Render Video"
     ↓
2. POST /api/render
     - Generate renderId
     - Write props to temp/{renderId}-props.json
     - Spawn: pnpm exec remotion render ... --props=temp/{renderId}-props.json
     - Store job in memory Map
     - Return renderId immediately
     ↓
3. Client polls GET /api/render?id={renderId}
     - Server reads from memory Map
     - Returns { status, progress, outputPath }
     ↓
4. Remotion CLI parses storyboard, renders frames
     - stdout shows progress (e.g., "Rendering frame 120/600 (20%)")
     - Server parses stdout, updates job.progress
     ↓
5. Render completes
     - Output: public/renders/{renderId}.mp4
     - job.status = "complete"
     - job.outputPath = "/renders/{renderId}.mp4"
     ↓
6. Client receives complete status
     - Shows "Download Video" button
     - Clicking downloads /renders/{renderId}.mp4
```

---

## Edge Cases Handled

1. **Long renders:** Progress polling shows %, user can see activity
2. **Render failure:** Error status returned with message
3. **Multiple concurrent renders:** Each has unique renderId
4. **Page refresh:** Job tracking is in-memory, lost on refresh (acceptable for MVP)
5. **Large videos:** Standard Remotion output, no special handling needed
6. **Windows compatibility:** Props passed via file path, not inline JSON

---

## Limitations (Acceptable for MVP)

1. **In-memory job tracking:** Jobs lost on server restart
2. **No render queue:** Concurrent renders limited by server resources
3. **No cleanup:** Old renders accumulate in `public/renders/`
4. **No authentication:** Anyone can trigger renders

Future enhancements could add:
- Redis/database for job persistence
- Render queue with rate limiting
- Automatic cleanup of old renders
- User-scoped render history

---

## Testing Plan

### Unit Tests
1. Props file written correctly
2. Composition ID mapping works for all aspect ratios
3. Progress parsing from stdout

### Integration Tests
1. POST /api/render returns renderId
2. GET /api/render returns correct status
3. Render completes and file exists

### Manual Tests
1. Generate video → Click Render → See progress → Download works
2. Test all aspect ratios (9:16, 16:9, 1:1)
3. Test with various storyboard sizes (5 scenes, 20 scenes)
4. Test error handling (invalid storyboard)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Render takes too long | Medium | Medium | Show progress %, add timeout |
| Server runs out of memory | Low | High | Limit concurrent renders |
| Output files too large | Low | Medium | Standard H.264 compression |
| Remotion CLI not found | Low | High | Document pnpm requirement |
| calculateMetadata fails | Low | High | Validate props before render |

---

## Success Criteria

- [ ] "Render Video" button triggers render process
- [ ] Progress percentage shown during render
- [ ] Download button appears when complete
- [ ] Downloaded video plays correctly
- [ ] All aspect ratios render correctly
- [ ] Error state shown if render fails

---

## Confidence Level: HIGH

This approach is sound because:
1. Uses standard Remotion CLI (proven, documented)
2. Reuses DynamicPreview composition (already tested in Feature 3)
3. Simple spawn-and-poll pattern (no complex WebSocket)
4. Props-via-file is cross-platform compatible
5. Public folder serving is built into Next.js

**Ready for implementation.**
