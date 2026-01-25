# Remotion MCP as a Service - Full Implementation Plan

## Vision
Build a web-based platform that replicates what Claude Code CLI does with Remotion MCP - allowing users to describe videos in natural language and watch AI generate actual TypeScript/React Remotion compositions in real-time.

---

## Phase 4: Landing Page Redesign

### Goal
Create a gorgeous, Lovable-style landing page with smooth scroll animations that looks like a $100k website.

### Components to Build

1. **Hero Section**
   - Gradient animated background
   - Large headline: "Create Videos with AI"
   - Subheadline explaining the value prop
   - Central prompt input (textarea)
   - "Generate Video" CTA button
   - Floating asset upload zone (drag & drop, 20 file limit)

2. **Features Section** (scroll-animated)
   - "How it works" 3-step process
   - Feature cards with icons and descriptions
   - Animated on scroll using Framer Motion

3. **Demo Section**
   - Video showcase of generated examples
   - Before/after comparison

4. **Tech Stack Section**
   - Logos: Remotion, Claude AI, React, TypeScript
   - Brief explanations

5. **CTA Section**
   - Final call to action
   - "Start Creating" button

### Libraries to Add
- `framer-motion` - Scroll animations, transitions
- `@radix-ui/react-*` - Accessible UI primitives
- `lucide-react` - Icons

---

## Phase 5: Sandbox Page

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  Header: Project Name | Status | Actions                     │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│   CHAT PANEL (40%)       │   PREVIEW PANEL (60%)            │
│                          │                                  │
│   ┌──────────────────┐   │   ┌────────────────────────────┐ │
│   │ Original Prompt  │   │   │                            │ │
│   └──────────────────┘   │   │    Remotion Player         │ │
│                          │   │    (Live Preview)          │ │
│   ┌──────────────────┐   │   │                            │ │
│   │ AI Response      │   │   └────────────────────────────┘ │
│   │ (Streaming)      │   │                                  │
│   │                  │   │   ┌────────────────────────────┐ │
│   │ ```tsx           │   │   │ Monaco Editor              │ │
│   │ // Generated     │   │   │ (Generated Code)           │ │
│   │ // code here     │   │   │                            │ │
│   │ ```              │   │   └────────────────────────────┘ │
│   └──────────────────┘   │                                  │
│                          │   [Render Video] [Download]      │
│   [Iterate Prompt]       │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

### Components

1. **SandboxLayout** - Main container with resizable panels
2. **ChatPanel** - Shows prompt and streaming AI responses
3. **PreviewPanel** - Remotion Player + Code Editor
4. **CodeViewer** - Monaco editor (read-only, syntax highlighted)
5. **StatusIndicator** - Shows generation progress

### Flow
1. User lands from landing page with prompt + assets
2. Show "Generating storyboard..." status
3. Stream storyboard response
4. Show "Generating composition code..."
5. Stream actual TypeScript code (visible in chat)
6. Write code to filesystem
7. Remotion Player loads the new composition
8. User can iterate with follow-up prompts

---

## Phase 6: Streaming API

### Endpoint: POST /api/generate-stream

Uses Server-Sent Events (SSE) to stream:
1. Status updates
2. Storyboard JSON (as it generates)
3. Composition code (character by character or chunk by chunk)
4. Completion signal

### SSE Event Types
```typescript
type StreamEvent =
  | { type: 'status', message: string }
  | { type: 'storyboard_chunk', content: string }
  | { type: 'storyboard_complete', data: Storyboard }
  | { type: 'code_chunk', content: string }
  | { type: 'code_complete', data: { code: string, path: string } }
  | { type: 'error', message: string }
  | { type: 'done' }
```

---

## Phase 7: File System Integration

### Composition File Writing
- Generate unique composition ID
- Write to `src/compositions/generated/{id}/`
- Files: `Composition.tsx`, `config.ts`, `content.ts`
- Hot reload triggers Remotion to pick up new composition

### Asset Copying
- Copy uploaded assets to `public/assets/{projectId}/`
- Reference in compositions via `staticFile('assets/{projectId}/...')`

---

## Phase 8: Remotion Player Integration

### Dynamic Loading
- Use Remotion's `<Player>` component
- Dynamic import of generated compositions
- Handle loading states and errors

### Preview Features
- Play/pause controls
- Scrubbing timeline
- Fullscreen mode
- Current frame/time display

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Landing Page │→ │ Sandbox Page │→ │ Generated Video      │   │
│  │ (Prompt+     │  │ (Chat+Preview│  │ (Download/Share)     │   │
│  │  Assets)     │  │  +Monaco)    │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND APIs                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ POST /api/generate-stream                                   │ │
│  │ - Receives: prompt, assets, theme                          │ │
│  │ - Streams: status, storyboard, code chunks                 │ │
│  │ - Writes: composition files to src/compositions/           │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ POST /api/render                                            │ │
│  │ - Triggers: pnpm exec remotion render {compositionId}      │ │
│  │ - Returns: video file path                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CLAUDE API (via Anthropic SDK)               │
│  - System prompt with Remotion component docs                   │
│  - Asset gallery context (visual + filenames)                   │
│  - Director mode: storyboard → composition code                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FILE SYSTEM                                  │
│  src/compositions/generated/                                    │
│    └── {projectId}/                                             │
│        ├── Composition.tsx    (generated code)                  │
│        ├── config.ts          (timing/settings)                 │
│        └── content.ts         (text content)                    │
│  public/assets/{projectId}/   (uploaded assets)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

1. **Phase 4: Landing Page** (Now)
   - Install framer-motion
   - Create animated hero section
   - Build feature sections
   - Implement asset upload zone
   - Connect to sandbox navigation

2. **Phase 5: Sandbox Page**
   - Create split layout
   - Build chat panel component
   - Add Monaco editor integration
   - Create status indicators

3. **Phase 6: Streaming API**
   - Convert generate-video to SSE endpoint
   - Stream storyboard generation
   - Stream code generation
   - Handle errors gracefully

4. **Phase 7: File System**
   - Write compositions to disk
   - Copy assets to public folder
   - Ensure hot reload works

5. **Phase 8: Remotion Player**
   - Integrate Player component
   - Handle dynamic composition loading
   - Add render trigger

---

## Success Criteria

- [ ] Landing page looks premium ($100k quality)
- [ ] Smooth scroll animations throughout
- [ ] Real-time code streaming visible in chat
- [ ] Monaco editor shows generated TypeScript
- [ ] Remotion Player shows live preview
- [ ] End-to-end flow works: prompt → preview → render
