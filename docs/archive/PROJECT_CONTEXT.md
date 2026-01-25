# Stan Hackathon: AI Video Editor - Project Context & Technical Specification

**Last Updated**: January 24, 2026
**Hackathon Dates**: January 24-26, 2026 (Toronto)
**Team**: Solo (with Claude Code)
**Repository**: Fork of `jhartquist/claude-remotion-kickstart`

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Hackathon Requirements](#hackathon-requirements)
3. [Technical Architecture](#technical-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Technology Stack](#technology-stack)
6. [Research & Inspiration](#research--inspiration)
7. [Risk Mitigation](#risk-mitigation)
8. [Future Features](#future-features)

---

## Project Overview

### Vision
Build a **VibeMotion.ai-style AI video editor** for Stan creators to auto-generate vertical videos (TikTok/Reels/Shorts) from 3-5 talking-head clips.

### Core Concept
- **Upload**: Drag-drop 3-5 raw video clips
- **Auto-Magic**: AI transcribes, removes silences, stitches clips, adds captions
- **Edit**: Chat with Claude to refine (like Lovable/Cursor for videos)
- **Export**: Download social-ready 9:16 vertical video

### Judging Criteria (Stan Hackathon)
- **Real Stan creators** will test the tool
- **User experience** is priority #1
- **Likelihood to reuse** the tool
- Focus: Working prototype > Feature bloat

### Philosophy
> "Build minimal working base first, then add features one-by-one. No over-engineering. Start with foundation, go feature-by-feature." - User mandate

---

## Hackathon Requirements

### Must-Have Features (MVP)
1. ✅ **Upload Interface**: Drag-drop 3-5 video clips
2. ✅ **Auto-Transcription**: Generate transcript from all clips
3. ✅ **Auto-Stitch**: AI combines clips with natural flow
4. ✅ **Script-Driven Editing**: Change text → change video
5. ✅ **Manual Controls**: Fine-tune after AI edits
6. ✅ **Vertical Video Output**: 1080x1920 (9:16 aspect ratio)

### UI/UX Requirements
- **VibeMotion.ai Clone**: Split-panel interface
  - **Left Panel**: Chat/Upload interface (like Lovable)
  - **Right Panel**: Live Remotion preview sandbox
- **Web-Based**: No installation, browser-only
- **No Login Required**: Direct access for demo/judging
- **Mobile-Responsive** (stretch goal)

### Technical Requirements
- **Framework**: Remotion (React-based programmatic video)
- **AI Orchestration**: Claude Code + Remotion MCP
- **Output Format**: MP4, 9:16, with burnt-in captions
- **Transcription**: Local (Whisper.cpp) to avoid API costs
- **Hosting**: Deployable to Vercel for live demo

---

## Technical Architecture

### System Diagram
```
┌─────────────────────────────────────────────────────┐
│                  Next.js 15 App                     │
├──────────────────┬──────────────────────────────────┤
│  Left Panel      │         Right Panel              │
│  (Chat/Upload)   │    (Remotion Preview)            │
│                  │                                  │
│  • Upload Zone   │  • Live Video Preview            │
│  • Clip List     │  • Remotion Studio Embed         │
│  • Transcript    │  • Frame Scrubber                │
│  • Chat with AI  │  • Export Controls               │
└──────────────────┴──────────────────────────────────┘
         ↓                          ↓
    API Routes               Remotion Engine
         ↓                          ↓
   Claude API              claude-remotion-kickstart
   Whisper.cpp                (14 Components)
```

### Data Flow
```
1. User uploads clips → IndexedDB (client-side storage)
2. Clips → Whisper.cpp → JSON transcripts with word-level timing
3. Transcripts + Clips → Claude API (with Remotion MCP context)
4. Claude → Generates Remotion composition code (React)
5. Remotion → Renders preview in iframe
6. User chats → Claude updates composition → Preview updates
7. Final render → MP4 download
```

### Key Architectural Decisions

#### Why Fork `claude-remotion-kickstart`?
- ✅ **Battle-tested**: 1,987 LOC, 0 errors, 92/100 quality score
- ✅ **Portrait-1080p Preset**: Already has 1080x1920 config
- ✅ **14 Production Components**: Caption, VideoSlide, Music, etc.
- ✅ **Word-Level Caption Timing**: Critical for auto-captions
- ✅ **MIT Licensed**: Safe for hackathon use

#### Why Next.js Wrapper?
- ✅ **Web-Based**: Judges can test in browser (no install)
- ✅ **API Routes**: Built-in for Claude/Whisper integration
- ✅ **React Native**: Remotion is React-based
- ✅ **Vercel Deploy**: One command to go live
- ✅ **File Uploads**: Easy client/server handling

#### Why Whisper.cpp (Not Deepgram)?
- ✅ **Free**: No API costs during hackathon
- ✅ **Local**: Faster, no rate limits
- ✅ **Word-Level Timing**: Needed for Caption component
- ⚠️ **Fallback**: Can switch to Deepgram if build fails

---

## Implementation Phases

### Phase 1: Core Foundation (Hours 1-4) ⏳ IN PROGRESS
**Goal**: Get Next.js app with Remotion preview working

**Tasks**:
- [x] Create PROJECT_CONTEXT.md (this file)
- [ ] Create Next.js 15 app structure
- [ ] Integrate `claude-remotion-kickstart` as workspace package
- [ ] Build split-panel UI (empty left, Remotion right)
- [ ] Verify test composition renders in browser

**Files to Create**:
- `app/page.tsx` - Main app entry
- `components/UploadPanel.tsx` - Left panel (placeholder)
- `components/PreviewPanel.tsx` - Right panel (Remotion iframe)
- `tailwind.config.ts` - Styling config

**Success Criteria**:
- ✅ `npm run dev` → localhost:3000 opens
- ✅ Split-panel UI visible
- ✅ Test Remotion video plays in right panel

---

### Phase 2: Upload & Storage (Hours 5-8)
**Goal**: Users can drag-drop 3-5 video clips

**Tasks**:
- [ ] Create drag-drop upload component
- [ ] Store files in IndexedDB (client-side)
- [ ] Display uploaded clips as thumbnails
- [ ] Pass clip paths to Remotion VideoSlide component

**Components**:
- `components/UploadZone.tsx` - Drag-drop UI
- `components/ClipThumbnails.tsx` - Show uploaded files
- `lib/storage.ts` - IndexedDB wrapper

**Success Criteria**:
- ✅ Upload 3 clips → see thumbnails
- ✅ Preview plays clips in sequence using VideoSlide

---

### Phase 3: Transcription (Hours 9-12)
**Goal**: Auto-generate transcripts from uploaded clips

**Tasks**:
- [ ] Install `@remotion/install-whisper-cpp`
- [ ] Create `/api/transcribe` endpoint
- [ ] Process each clip through Whisper
- [ ] Merge transcripts into combined script
- [ ] Display in left panel

**API Design**:
```typescript
POST /api/transcribe
Body: { clipPaths: string[] }
Response: {
  words: { text: string, start: number, end: number }[],
  clipTranscripts: Record<string, Word[]>
}
```

**Success Criteria**:
- ✅ Upload clips → auto-transcribe
- ✅ See combined script with timestamps
- ✅ Word-level timing accurate

---

### Phase 4: AI Chat Integration (Hours 13-16)
**Goal**: Chat with Claude to edit video

**Tasks**:
- [ ] Build chat interface in left panel
- [ ] Integrate Claude API with Remotion MCP skill
- [ ] Handle prompts: "Remove pauses", "Add captions", "Reorder"
- [ ] Apply changes to Remotion composition dynamically

**API Design**:
```typescript
POST /api/chat
Body: {
  message: string,
  composition: CompositionState,
  clips: ClipMetadata[]
}
Response: {
  reply: string,
  updatedComposition: CompositionState
}
```

**Success Criteria**:
- ✅ Type "add captions" → Claude updates composition
- ✅ Preview auto-refreshes with changes
- ✅ Chat history persists during session

---

### Phase 5: Auto-Stitch & Silence Removal (Hours 17-20)
**Goal**: AI automatically edits clips together

**Tasks**:
- [ ] Implement silence detection (Remotion utils)
- [ ] Auto-trim silence at start/end of clips
- [ ] Add 0.15s padding between clips
- [ ] Auto-generate captions from transcript
- [ ] Apply Portrait-1080p preset (1080x1920)

**Remotion Components Used**:
- `Caption.tsx` (from kickstart) - Word-level captions
- `VideoSlide.tsx` - Clip embedding with trim
- `Music.tsx` - Optional background audio
- `presets.ts` - Portrait-1080p config

**Success Criteria**:
- ✅ Upload raw clips → auto-stitched
- ✅ Silences removed, clips flow naturally
- ✅ Captions appear synced to words
- ✅ Vertical video (1080x1920) renders correctly

---

## Technology Stack

### Core Framework
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Remotion** | 4.0.382 | Programmatic video engine |
| **Next.js** | 15.x | Web framework |
| **React** | 19.0.0 | UI + Remotion compositions |
| **Tailwind CSS** | 4.0.0 | Styling |

### AI & Transcription
| Technology | Purpose | Cost |
|-----------|---------|------|
| **Claude API** | Sonnet 4.5 for video editing | ~$0.50/video |
| **Remotion MCP Skill** | AI framework context | Free |
| **Whisper.cpp** | Local transcription | Free |
| **Deepgram** (fallback) | Cloud transcription | $0.0043/min |

### Storage & Deployment
| Technology | Purpose |
|-----------|---------|
| **IndexedDB** | Client-side clip storage |
| **Vercel** | Hosting + serverless API |
| **pnpm** | Package manager |

### Optional Integrations (Post-MVP)
- **Nano Banana Pro**: AI image generation
- **11Labs**: Voiceovers & SFX
- **ffmpeg**: Advanced video processing

---

## Research & Inspiration

### Key Resources Analyzed

#### 1. VibeMotion.ai (UI Reference)
- **Interface**: Chat left, sandbox right (exactly what we're cloning)
- **Workflow**: Upload → Prompt → Preview → Export
- **Key Feature**: Script-driven editing (change text → updates video)

#### 2. Remotion Community Success Stories (X/Twitter)
- **@postbridge_**: Created promo video in 4 prompts (~$10 vs $1500 traditional)
- **@SaminFazal**: Built full tutorial video using Remotion MCP
- **@MengTo**: 11k lines, 685 commits in 3 weeks using Cursor + Remotion
- **@justinemoore_js**: Claude as orchestration agent for long-form videos

#### 3. Technical Tutorials Reviewed
- **"Claude Code is our 10x editor with Remotion" (Ray Fernando & Bootoshi)**
  - Asset Gallery Technique: HTML gallery → screenshot → feed to Claude
  - Director Mode: Plan storyboard before coding
  - Visual Controls: `zod` schemas for manual tweaks

- **"Creating videos just from prompting" (Remotion Official)**
  - 3 examples: Tweet screenshot, 3D logo spin, auto-captions
  - Word-level timing with Caption component
  - Silence detection workflow

#### 4. GitHub Repository Analysis
Compared 4 repos, selected `jhartquist/claude-remotion-kickstart`:
- **36 stars** (highest in category)
- **0 errors, 1 minor warning** (linter check)
- **14 production components** (TitleSlide, VideoSlide, Caption, Music, etc.)
- **Portrait-1080p preset** (1080x1920) ✅ Critical for hackathon
- **MIT licensed** ✅ Safe for commercial use

---

## Risk Mitigation

### Potential Issues & Solutions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Claude API rate limits** | 🔴 High | Cache responses, batch requests, use Haiku for non-critical |
| **Whisper.cpp build fails** | 🟡 Medium | Fallback to Deepgram API ($5 budget) |
| **File upload size limits** | 🟡 Medium | Client-side compression, warn user at 100MB |
| **Remotion render crashes** | 🟡 Medium | Error boundaries, 5min timeout, queue system |
| **Vertical video alignment** | 🟢 Low | Use Portrait-1080p preset from `presets.ts` |
| **Browser compatibility** | 🟢 Low | Target Chrome/Edge (judges likely use these) |

### Hackathon Time Management
- **20 hours total** (24hr event - sleep/meals)
- **Phase 1-5**: 20 hours (4hrs each)
- **Buffer**: Debug time built into each phase
- **MVP by Hour 16**: Leaves 4hrs for polish/testing

---

## Future Features (Post-MVP)

### Feature Set 1: Manual Controls (Phase 6)
- Drag to reorder clips
- Manual trim start/end points
- Edit transcript text (updates video timing)
- Visual controls for caption styling (font, color, position)

### Feature Set 2: AI Enhancements (Phase 7)
- **Nano Banana Pro**: Generate B-roll images from script
- **11Labs**: Voiceovers & sound effects
- **Auto-thumbnails**: Generate 5 options using Glif
- **Scene transitions**: Fade, wipe, zoom effects

### Feature Set 3: Export & Sharing (Phase 8)
- Render to MP4 (1080x1920)
- Export .srt caption file for YouTube/TikTok
- Shareable preview link (Vercel deployment)
- Download ZIP with assets (clips + captions + project file)

### Feature Set 4: Polish (Phase 9)
- Progress indicators (transcription, rendering)
- Error handling & retry logic
- Keyboard shortcuts (Space = play/pause, etc.)
- Mobile responsiveness
- Dark mode (match Stan branding)

### Feature Set 5: Stan Integration (Post-Hackathon)
- Authenticate with Stan account
- Fetch creator's existing content
- Auto-post to Stan feed
- Analytics dashboard (views, engagement)

---

## Key Technical Patterns

### 1. Asset Gallery Technique (Bootoshi Method)
**Problem**: AI can't "see" 50+ files in a folder
**Solution**:
1. Generate HTML gallery of assets with filenames
2. Screenshot the gallery
3. Feed screenshot to Claude
4. AI now maps visuals → filenames

### 2. Director Mode (Ray Fernando)
**Pattern**: Don't jump to code, plan first
**Prompt**:
```
"Act as a Director. Create a scene-by-scene breakdown
for a 30-second vertical video. Focus on high-energy cuts.
Use Spielberg techniques. Output plan before coding."
```

### 3. Visual Controls (Remotion Best Practice)
**Pattern**: Add manual sliders for AI-generated values
**Code**:
```typescript
import { zod } from '@remotion/zod';

const schema = z.object({
  yPosition: z.number().visual({ min: 0, max: 1920 })
});
```
→ Remotion Studio UI shows slider to adjust `yPosition`

### 4. Word-Level Timing (Caption Component)
**Pattern**: Sync captions to transcript timestamps
**Data Structure**:
```typescript
type Word = { text: string; start: number; end: number };
const words: Word[] = [
  { text: "Hello", start: 0.0, end: 0.5 },
  { text: "world", start: 0.5, end: 1.0 }
];
```
→ Caption component highlights active word at current frame

---

## Development Commands

### Setup
```bash
# Install dependencies
pnpm install

# Install Remotion skill (if not already)
npx skills add remotion

# Install Whisper.cpp
npx @remotion/install-whisper-cpp
```

### Development
```bash
# Run Next.js dev server
pnpm dev

# Run Remotion Studio (for composition testing)
pnpm remotion studio

# Transcribe a video
npx remotion transcribe path/to/video.mp4

# Render video
npx remotion render <composition-id> output.mp4
```

### Deployment
```bash
# Deploy to Vercel
vercel

# Build for production
pnpm build
```

---

## Project File Structure

```
claude-remotion-kickstart/
├── PROJECT_CONTEXT.md          # This file
├── README.md                   # Original kickstart docs
├── package.json                # Dependencies
├── remotion.config.ts          # Remotion settings
├── tailwind.config.ts          # Tailwind config
├── tsconfig.json               # TypeScript config
│
├── app/                        # Next.js app (NEW)
│   ├── page.tsx                # Main UI (split-panel)
│   ├── layout.tsx              # Root layout
│   ├── api/
│   │   ├── chat/route.ts       # Claude API endpoint
│   │   ├── transcribe/route.ts # Whisper endpoint
│   │   └── render/route.ts     # Remotion render
│   └── globals.css             # Global styles
│
├── components/                 # Next.js UI components (NEW)
│   ├── UploadPanel.tsx         # Left panel
│   ├── PreviewPanel.tsx        # Right panel
│   ├── UploadZone.tsx          # Drag-drop
│   ├── ClipThumbnails.tsx      # Uploaded clips
│   ├── ChatInterface.tsx       # AI chat
│   └── TranscriptView.tsx      # Show transcripts
│
├── lib/                        # Utilities (NEW)
│   ├── storage.ts              # IndexedDB wrapper
│   ├── claude.ts               # Claude API client
│   ├── whisper.ts              # Whisper.cpp wrapper
│   └── types.ts                # TypeScript types
│
├── src/                        # Remotion code (EXISTING)
│   ├── Root.tsx                # Remotion root
│   ├── presets.ts              # Portrait-1080p config
│   ├── components/             # 14 Remotion components
│   │   ├── Caption.tsx         # Word-level captions ✅
│   │   ├── VideoSlide.tsx      # Clip embedding ✅
│   │   ├── Music.tsx           # Background audio
│   │   ├── TitleSlide.tsx      # Title cards
│   │   └── ... (10 more)
│   └── utils/
│       └── createComposition.tsx
│
└── public/                     # Static assets
    ├── assets/                 # User uploads (gitignored)
    └── placeholder.mp4         # Demo video
```

---

## Success Metrics (Hackathon Judging)

### Quantitative
- ✅ **Upload 3-5 clips**: Works reliably
- ✅ **Transcription accuracy**: >90% word-level
- ✅ **Auto-stitch quality**: Natural flow, no jarring cuts
- ✅ **Caption sync**: <100ms timing error
- ✅ **Render time**: <2min for 30sec video

### Qualitative (Stan Creator Feedback)
- ✅ **Ease of use**: "I'd use this weekly"
- ✅ **Time savings**: "Saves me 2 hours per video"
- ✅ **Output quality**: "Good enough to post"
- ✅ **AI helpfulness**: "Claude understood my edits"

---

## Notes & Learnings

### From Conversation with User
> "I don't want you to over-engineer anything. I'd rather just create a base and then go feature-by-feature."

> "One of the biggest problems when it comes to vibe coding is that you will try and over-engineer something, but then we actually don't create a good product."

> "I need you to pre-plan for every single possible little thing that could happen... I'm giving you full permission to switch midway if you think you'll have a better shot."

### From Research
- **Bootoshi**: "Creating a native agentic environment where skills compound over time"
- **Samin Fazal**: "This changes how I think about making technical videos forever"
- **Harshith**: "Ultimate leverage: Code that creates content"

### From Code Analysis
- **Quality Score**: 92/100 for `claude-remotion-kickstart`
- **Key Insight**: Caption component's word-level timing is production-ready
- **Risk**: Non-pure animation warning (easily fixable with `interpolate()`)

---

## Contact & Links

- **Hackathon**: Stan Creator Platform (Jan 24-26, 2026)
- **Repository**: Fork of [jhartquist/claude-remotion-kickstart](https://github.com/jhartquist/claude-remotion-kickstart)
- **Remotion MCP Skill**: [@remotion/mcp](https://www.npmjs.com/package/@remotion/mcp)
- **Remotion Docs**: [remotion.dev](https://remotion.dev)

---

**Last Updated**: January 24, 2026 (Pre-Phase 1)
**Status**: 📝 Documentation Complete → Ready to build Phase 1
