<p align="center">
  <img src="public/images/logo.png" alt="VibeMotion Logo" width="200" />
</p>

<h1 align="center">VibeMotion</h1>

<p align="center">
  <strong>AI-Powered Video Editor</strong><br>
  Transform raw video clips into polished, social-ready content with AI
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#api-reference">API Reference</a>
</p>

---

## What is VibeMotion?

VibeMotion is an AI-powered video editor that transforms raw video clips into polished, social-ready content. Users upload videos, which are automatically transcribed using OpenAI Whisper, then the system generates smart storyboards with intelligent scene ordering, B-roll overlays, and TikTok-style animated captions—all rendered in real-time using Remotion.

**Built for creators who want professional results without manual editing.**

## Features

### Core Capabilities

- **AI Transcription** - Automatic speech-to-text with word-level timestamps via OpenAI Whisper
- **Smart Storyboarding** - AI-generated scene ordering with intelligent B-roll placement
- **TikTok-Style Captions** - Animated subtitles with word highlighting and phrase grouping
- **Real-Time Preview** - Live video preview powered by Remotion Player
- **Multi-Track Timeline** - Visual timeline with video, audio, and overlay tracks
- **One-Click Render** - Export to MP4 at up to 1080p @ 60fps

### AI Pipeline

- **Whisper Hallucination Filtering** - Removes fabricated words from transcripts
- **Semantic Phrase Grouping** - Groups words into readable caption segments
- **Visual Scene Analysis** - Intelligent B-roll timing and placement
- **Quality Scoring** - Transcript quality metrics (0-100 score)

### Video Components

| Component      | Description                              |
|----------------|------------------------------------------|
| TitleSlide     | Full-screen title with animations        |
| ContentSlide   | Header with body text                    |
| VideoSlide     | Embedded video playback                  |
| BRollVideo     | B-roll overlays with zoom control        |
| TikTokCaption  | Animated word-by-word subtitles          |
| Music          | Background audio with fade in/out        |

## Demo

**Try it live:** Upload your videos, describe your vision, and watch AI generate your video in real-time.

## Quick Start

### Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **pnpm** - Install with `npm install -g pnpm`
- **ffmpeg** - Required for video/audio processing
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: [Download](https://ffmpeg.org/download.html)

### Installation

```bash
# Clone the repository
git clone https://github.com/SammyTourani/VibeMotion.git
cd VibeMotion

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local
```

### Environment Variables

Create a `.env.local` file with your API keys:

```bash
# Required for transcription
OPENAI_API_KEY=your_openai_api_key

# Optional - for image/video generation
REPLICATE_API_TOKEN=your_replicate_token

# Optional - for voiceovers
ELEVENLABS_API_KEY=your_elevenlabs_key
```

### Run Development Server

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start creating videos.

## Architecture

```
VibeMotion/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── transcribe/           # Whisper transcription
│   │   ├── generate-storyboard/  # AI storyboard generation
│   │   ├── upload-assets/        # File upload handling
│   │   └── render/               # Video rendering
│   ├── sandbox/                  # Main editor interface
│   └── page.tsx                  # Landing page
│
├── components/                   # React Components
│   ├── landing/                  # Landing page sections
│   │   ├── HeroSection.tsx       # Hero with upload
│   │   ├── FeatureCards.tsx      # Feature highlights
│   │   ├── HowItWorks.tsx        # Step-by-step guide
│   │   └── TechStack.tsx         # Technology logos
│   ├── sandbox/                  # Editor components
│   │   ├── RemotionPreview.tsx   # Live video preview
│   │   ├── MultiTrackTimeline.tsx # Timeline UI
│   │   ├── TranscriptPanel.tsx   # Transcript editor
│   │   └── CodeEditor.tsx        # Generated code view
│   └── upload/                   # Upload components
│
├── lib/                          # Core Libraries
│   ├── pipeline/                 # AI Processing Pipeline
│   │   ├── transcription-service.ts  # Whisper integration
│   │   ├── transcript-validator.ts   # Hallucination filtering
│   │   ├── smart-storyboard.ts       # Scene generation
│   │   ├── narrative-reorder.ts      # Clip ordering
│   │   └── types.ts                  # Type definitions
│   └── modification/             # Edit Operations
│       ├── intent-classifier.ts  # NLP intent detection
│       └── apply-operations.ts   # Apply edits
│
├── src/                          # Remotion Compositions
│   ├── compositions/
│   │   └── dynamic-preview/      # Main preview composition
│   ├── components/               # Video components
│   │   ├── AnimatedText.tsx      # Text animations
│   │   ├── TitleSlide.tsx        # Title cards
│   │   └── Music.tsx             # Background audio
│   └── utils/
│       └── segmentTranscript.ts  # Caption grouping
│
├── hooks/                        # React Hooks
│   ├── useVideoGeneration.ts     # Video generation state
│   └── useRenderStatus.ts        # Render progress
│
└── public/                       # Static Assets
    ├── assets/                   # User uploads (gitignored)
    └── renders/                  # Rendered videos (gitignored)
```

## AI Processing Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Upload    │────▶│  Transcribe  │────▶│    Validate     │
│   Videos    │     │   (Whisper)  │     │  (Filter Junk)  │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                  │
                                                  ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Render    │◀────│   Preview    │◀────│   Storyboard    │
│   (MP4)     │     │  (Remotion)  │     │   (AI Order)    │
└─────────────┘     └──────────────┘     └─────────────────┘
```

### Key Pipeline Components

1. **Transcription Service** (`lib/pipeline/transcription-service.ts`)
   - Extracts audio from video using ffmpeg
   - Sends to OpenAI Whisper for transcription
   - Returns word-level timestamps

2. **Transcript Validator** (`lib/pipeline/transcript-validator.ts`)
   - Filters hallucinated words (zero-duration, identical timestamps)
   - Removes known hallucination phrases
   - Calculates quality score

3. **Smart Storyboard** (`lib/pipeline/smart-storyboard.ts`)
   - Generates scene timeline from clips
   - Places B-roll overlays intelligently
   - Enforces minimum overlay duration (1 second)

4. **Dynamic Preview** (`src/compositions/dynamic-preview/`)
   - Renders video in real-time
   - Multi-layer composition (audio, video, B-roll, captions)
   - TikTok-style animated captions

## API Reference

### POST /api/transcribe

Transcribe a video file using OpenAI Whisper.

```typescript
// Request
{
  assetId: string;
  publicPath: string;  // e.g., "assets/videos/video_0.mp4"
  language?: string;   // e.g., "en" (optional)
}

// Response
{
  success: boolean;
  transcript: {
    assetId: string;
    text: string;
    words: Array<{
      text: string;
      start: number;
      end: number;
    }>;
    duration: number;
    wordCount: number;
  }
}
```

### POST /api/generate-storyboard

Generate a smart storyboard from transcribed clips.

```typescript
// Request
{
  clips: Array<{
    id: string;
    publicPath: string;
    duration: number;
    words: TranscriptWord[];
  }>;
  theme?: ThemeConfig;
}

// Response
{
  success: boolean;
  storyboard: {
    scenes: Scene[];
    totalDuration: number;
  }
}
```

### POST /api/render

Render the video to MP4.

```typescript
// Request
{
  storyboard: Storyboard;
  outputPath?: string;
  quality?: "draft" | "production";
}

// Response
{
  success: boolean;
  outputPath: string;
  duration: number;
}
```

## Commands

```bash
# Development
pnpm run dev          # Start Next.js dev server
pnpm run studio       # Start Remotion Studio

# Build & Deploy
pnpm run build        # Build for production
pnpm run start        # Start production server

# Utilities
pnpm run lint         # Run ESLint
pnpm exec tsc         # Type check
pnpm run upgrade      # Upgrade Remotion
```

## Video Presets

All videos render at 60fps. Available presets:

| Preset            | Resolution | Aspect Ratio | Use Case           |
|-------------------|------------|--------------|---------------------|
| `Portrait-1080p`  | 1080×1920  | 9:16         | TikTok, Reels, Shorts |
| `Landscape-1080p` | 1920×1080  | 16:9         | YouTube, Vimeo      |
| `Square-1080p`    | 1080×1080  | 1:1          | Instagram Feed      |
| `Landscape-720p`  | 1280×720   | 16:9         | Fast preview        |

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Next.js 15](https://nextjs.org/) | Full-stack React framework |
| [Remotion](https://remotion.dev/) | Programmatic video rendering |
| [OpenAI Whisper](https://openai.com/research/whisper) | Speech-to-text transcription |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [Framer Motion](https://www.framer.com/motion/) | React animations |
| [Zod](https://zod.dev/) | Runtime type validation |

## Deployment

### Deploy to GitHub Pages

This project is configured to deploy automatically via GitHub Actions.

1. Go to your repository **Settings > Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` branch - the site will build and deploy automatically

### Custom Domain Setup

1. In **Settings > Pages**, add your custom domain (e.g., `vibemotiontech.com`)
2. Configure DNS records at your registrar:
   - Add 4 A records pointing to GitHub's IPs: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Add CNAME for `www` pointing to `yourusername.github.io`
3. Enable **Enforce HTTPS**

See [docs/DOMAIN_SETUP.md](docs/DOMAIN_SETUP.md) for detailed instructions.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is [MIT licensed](LICENSE).

**Note:** Remotion has separate licensing requirements. Companies with 3+ employees need a Remotion license to render videos. See the [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) for details.

---

<p align="center">
  Built with Claude AI + Remotion
</p>
