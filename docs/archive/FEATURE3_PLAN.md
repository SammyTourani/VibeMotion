# Feature 3: Live Remotion Player - Implementation Plan

**Status:** Planning
**Priority:** HIGH
**Dependencies:** Feature 1 (File System) ✅, Feature 2 (Asset Upload) ✅

---

## Problem Statement

Currently, after video generation completes:
1. The sandbox shows a placeholder: "Remotion Player integration coming soon"
2. Users cannot preview their generated video in real-time
3. To see the video, they must open Remotion Studio separately (`pnpm run studio`)
4. This breaks the seamless UX we're building

**Goal:** Show a live, playable preview of the generated video directly in the sandbox.

---

## Technical Analysis

### What We Have

1. **@remotion/player is installed** (v4.0.409) - Ready to use
2. **Generated compositions** are written to `src/compositions/generated/{projectId}/`
3. **Storyboard data** is available in state after generation
4. **Composition config** (dimensions, fps, duration) is known

### The Challenge

The AI generates TypeScript code that gets written to the filesystem, but:
- Next.js webpack doesn't know about dynamically created files at runtime
- We can't use `lazyComponent` to import files created after build time
- Dynamic imports (`import()`) won't work for runtime-generated files

### Solution Approaches Evaluated

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A: lazyComponent import** | Direct use of generated code | Won't work - webpack can't resolve runtime files | ❌ Rejected |
| **B: DynamicPreview component** | Works immediately, no file import issues | Requires building a preview component | ✅ **Selected** |
| **C: Iframe to Remotion Studio** | Full Remotion rendering | Complex, requires separate server | ❌ Rejected |
| **D: Eval generated code** | Uses actual AI code | Security risk, complex bundling | ❌ Rejected |

---

## Selected Solution: DynamicPreview Component

Create a **generic Remotion composition** that:
1. Accepts storyboard data as `inputProps`
2. Renders scenes dynamically based on storyboard structure
3. Works with the Remotion Player immediately - no file imports needed

### How It Works

```
[Storyboard Generated]
        ↓
[Pass storyboard to DynamicPreview as inputProps]
        ↓
[Remotion Player renders DynamicPreview]
        ↓
[User sees live preview in sandbox]
```

This bypasses the dynamic import problem entirely because:
- DynamicPreview is a static component (exists at build time)
- Only the DATA (storyboard) is dynamic, not the component
- The Player can render it immediately

---

## Implementation Plan

### Step 3.1: Create DynamicPreview Composition

**File:** `src/compositions/dynamic-preview/DynamicPreview.tsx`

A Remotion composition that renders storyboard data:

```tsx
import React from "react";
import { AbsoluteFill, Sequence, Img, Video, Audio, staticFile } from "remotion";
import { TitleSlide } from "../../components/TitleSlide";
import { ContentSlide } from "../../components/ContentSlide";

interface Scene {
  id: string;
  type: "title" | "content" | "image" | "video" | "transition";
  duration: number;
  description: string;
  text?: string;
  assets?: string[];
  voiceover?: string;
  animation?: string;
}

interface DynamicPreviewProps {
  scenes: Scene[];
  totalDuration: number;
  theme: {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
  };
}

export const DynamicPreview: React.FC<DynamicPreviewProps> = ({
  scenes,
  theme,
}) => {
  let currentFrame = 0;
  const fps = 60;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.backgroundColor }}>
      {scenes.map((scene, index) => {
        const startFrame = currentFrame;
        const durationInFrames = scene.duration * fps;
        currentFrame += durationInFrames;

        return (
          <Sequence
            key={scene.id || index}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            {renderScene(scene, theme)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

function renderScene(scene: Scene, theme: DynamicPreviewProps["theme"]) {
  switch (scene.type) {
    case "title":
      return (
        <TitleSlide
          title={scene.text || scene.description}
          className={`bg-[${theme.backgroundColor}] text-[${theme.textColor}]`}
        />
      );

    case "content":
      return (
        <ContentSlide
          header={scene.text || ""}
          content={scene.description}
          className={`bg-[${theme.backgroundColor}] text-[${theme.textColor}]`}
        />
      );

    case "image":
      if (scene.assets?.[0]) {
        return (
          <AbsoluteFill>
            <Img
              src={staticFile(scene.assets[0])}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        );
      }
      return <ContentSlide header="Image" content={scene.description} />;

    case "video":
      if (scene.assets?.[0]) {
        return (
          <AbsoluteFill>
            <Video
              src={staticFile(scene.assets[0])}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        );
      }
      return <ContentSlide header="Video" content={scene.description} />;

    case "transition":
      return (
        <AbsoluteFill style={{ backgroundColor: theme.backgroundColor }} />
      );

    default:
      return (
        <ContentSlide
          header={scene.type}
          content={scene.description}
        />
      );
  }
}
```

### Step 3.2: Create RemotionPreview Component for Next.js

**File:** `components/sandbox/RemotionPreview.tsx`

A wrapper that handles Next.js SSR and integrates with the sandbox:

```tsx
"use client";

import React, { useCallback, useMemo } from "react";
import { Player, RenderLoading } from "@remotion/player";
import { AbsoluteFill } from "remotion";
import { DynamicPreview } from "@/src/compositions/dynamic-preview/DynamicPreview";

interface Scene {
  id: string;
  type: string;
  duration: number;
  description: string;
  text?: string;
  assets?: string[];
}

interface Storyboard {
  scenes: Scene[];
  totalDuration: number;
  summary: string;
}

interface RemotionPreviewProps {
  storyboard: Storyboard;
  isPlaying: boolean;
  onPlayChange: (playing: boolean) => void;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  theme: {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
  };
}

const DIMENSIONS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export const RemotionPreview: React.FC<RemotionPreviewProps> = ({
  storyboard,
  isPlaying,
  onPlayChange,
  aspectRatio = "9:16",
  theme,
}) => {
  const dimensions = DIMENSIONS[aspectRatio];
  const fps = 60;
  const durationInFrames = Math.ceil(storyboard.totalDuration * fps);

  const inputProps = useMemo(
    () => ({
      scenes: storyboard.scenes,
      totalDuration: storyboard.totalDuration,
      theme,
    }),
    [storyboard, theme]
  );

  const renderLoading: RenderLoading = useCallback(({ height, width }) => {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#1a1a1a",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#666", fontSize: 14 }}>
          Loading preview ({width}x{height})
        </div>
      </AbsoluteFill>
    );
  }, []);

  return (
    <Player
      component={DynamicPreview}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={dimensions.width}
      compositionHeight={dimensions.height}
      style={{
        width: "100%",
        height: "100%",
      }}
      controls
      loop
      autoPlay={isPlaying}
      clickToPlay
      renderLoading={renderLoading}
    />
  );
};
```

### Step 3.3: Dynamic Import in Sandbox (SSR Fix)

**File:** `app/sandbox/page.tsx` (modification)

Use Next.js dynamic import to avoid SSR issues:

```tsx
// At the top of the file, add dynamic import
const RemotionPreview = dynamic(
  () => import("@/components/sandbox/RemotionPreview").then((mod) => mod.RemotionPreview),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-900/50">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading player...
        </div>
      </div>
    ),
  }
);
```

### Step 3.4: Update Sandbox Preview Section

Replace the placeholder in `app/sandbox/page.tsx` with the actual player:

```tsx
{/* Preview content - REPLACE EXISTING PLACEHOLDER */}
<div className="flex-1 flex items-center justify-center p-4 min-h-0">
  {showCode ? (
    <div className="w-full h-full">
      <CodeEditor
        code={generatedCode || "// Generated code will appear here..."}
        readOnly={true}
      />
    </div>
  ) : status === "complete" && storyboard ? (
    <div className="relative aspect-[9/16] h-full max-h-[calc(100vh-200px)] rounded-xl border border-white/10 overflow-hidden">
      <RemotionPreview
        storyboard={storyboard}
        isPlaying={isPlaying}
        onPlayChange={setIsPlaying}
        aspectRatio="9:16"
        theme={{
          primaryColor: "#8B5CF6",
          backgroundColor: "#000000",
          textColor: "#FFFFFF",
        }}
      />
    </div>
  ) : status === "error" ? (
    // ... error state (existing)
  ) : (
    // ... loading state (existing)
  )}
</div>
```

### Step 3.5: Wire Up Play/Pause Controls

The existing play/pause buttons in the sandbox should control the Player:

```tsx
// The isPlaying state already exists, just need to pass it to RemotionPreview
// The Player's controls prop gives built-in controls
// Our custom buttons can be hidden or used as additional controls
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/compositions/dynamic-preview/DynamicPreview.tsx` | CREATE | Core preview composition |
| `src/compositions/dynamic-preview/index.ts` | CREATE | Export barrel file |
| `components/sandbox/RemotionPreview.tsx` | CREATE | Next.js wrapper for Player |
| `app/sandbox/page.tsx` | MODIFY | Integrate RemotionPreview |

---

## Storyboard-to-Component Mapping

| Scene Type | Rendered Component | Notes |
|------------|-------------------|-------|
| `title` | `<TitleSlide>` | Uses scene.text or description |
| `content` | `<ContentSlide>` | Header + content |
| `image` | `<Img>` + `staticFile()` | Uses scene.assets[0] |
| `video` | `<Video>` + `staticFile()` | Uses scene.assets[0] |
| `transition` | Solid color fill | Uses theme.backgroundColor |
| default | `<ContentSlide>` | Fallback for unknown types |

---

## Edge Cases Handled

1. **No storyboard yet:** Show loading state
2. **Empty scenes array:** Show empty preview with background
3. **Missing assets:** Fall back to ContentSlide with description
4. **Invalid scene type:** Fall back to ContentSlide
5. **SSR in Next.js:** Dynamic import with `ssr: false`
6. **Large storyboards:** Player handles long videos natively

---

## What This Does NOT Do (By Design)

1. **Does NOT execute AI-generated code** - Too complex and risky
2. **Does NOT require Remotion Studio** - Self-contained in the app
3. **Does NOT dynamically import generated files** - Uses data-driven approach
4. **Does NOT support ALL Remotion features** - Limited to storyboard scenes

The generated code is still written to disk for:
- Full rendering via Remotion CLI
- Opening in Remotion Studio for fine-tuning
- Future enhancements

---

## Testing Plan

### Unit Tests
1. DynamicPreview renders with valid storyboard
2. Scene type switching works correctly
3. Assets load via staticFile()

### Integration Tests
1. Generate video → storyboard appears → preview renders
2. Play/pause controls work
3. Preview updates when new storyboard is generated

### Manual Tests
1. Generate a video with multiple scene types
2. Verify preview matches storyboard structure
3. Test with uploaded assets (images, videos)
4. Test all aspect ratios (9:16, 16:9, 1:1, 4:5)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Player doesn't render scenes correctly | Medium | High | Comprehensive scene type handling |
| SSR errors in Next.js | Medium | High | Dynamic import with ssr: false |
| Asset paths don't resolve | Low | Medium | Use staticFile() consistently |
| Performance with many scenes | Low | Low | Remotion handles this natively |
| Theme colors don't apply | Medium | Low | Test Tailwind classes with Player |

---

## Implementation Order

1. **Step 3.1:** Create `DynamicPreview.tsx` composition
2. **Step 3.2:** Create `RemotionPreview.tsx` wrapper
3. **Step 3.3:** Add dynamic import to sandbox
4. **Step 3.4:** Replace placeholder with actual player
5. **Step 3.5:** Test and verify

---

## Success Criteria

- [ ] Preview shows immediately after storyboard completes
- [ ] All scene types render appropriately
- [ ] Play/pause/seek controls work
- [ ] Uploaded assets appear in preview
- [ ] No SSR errors in Next.js
- [ ] Aspect ratios render correctly
- [ ] Theme colors apply to scenes

---

## Confidence Level: HIGH

This approach is sound because:
1. Uses Remotion's official `@remotion/player` (already installed)
2. Avoids dynamic file imports (known Next.js limitation)
3. Data-driven rendering is a proven pattern
4. Builds on existing components (TitleSlide, ContentSlide)
5. Isolated changes - doesn't affect generation pipeline

**Ready for implementation.**
