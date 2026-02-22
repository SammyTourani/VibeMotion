# 🎬 VibeMotion — AI Video Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://typescriptlang.org)
[![Remotion](https://img.shields.io/badge/Remotion-4.0-orange)](https://remotion.dev)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSammyTourani%2FVibeMotion)

> **Transform raw iPhone clips into viral TikTok/Reels-ready videos in minutes — no editing skills needed.**

VibeMotion is an AI-powered video editor that automates the entire post-production pipeline: transcription → visual analysis → A/B-roll classification → animated captions → final MP4 export.

---

## ✨ Demo

*[Demo GIF would show: uploading a raw iPhone MOV → Whisper transcription in progress → Gemini Vision analyzing frames → animated TikTok-style captions appearing → final polished video export in 90 seconds]*

---

## 🚀 Features

### AI Pipeline
- 🎙️ **Whisper Transcription** — Word-level timestamps, 99% accuracy across 100+ languages
- 👁️ **Gemini Vision Analysis** — Frame-by-frame AI understands *what's being shown*, not just audio
- 🧠 **Smart A/B-Roll Classification** — Automatically decides which clips tell the story best
- 📝 **TikTok-Style Captions** — Animated word-by-word subtitles, multiple styles

### Editor
- 🎬 **Live Remotion Preview** — See your video render in real-time before export
- 📱 **iPhone Native** — MOV files auto-transcoded to MP4 via ffmpeg
- 🎵 **Background Music** — Auto-fade, volume normalization
- 🔊 **AI Voiceover** — Optional ElevenLabs TTS voiceover generation

### Platform
- 🔐 **Supabase Auth** — Email + Google OAuth, protected dashboard
- 💳 **Stripe Payments** — Freemium: 3 free exports/mo → $12/mo Pro unlimited
- 📊 **Project Dashboard** — Full history, re-download anytime
- ⚡ **Real-time Progress** — SSE streaming updates during generation

---

## 🏗️ Architecture

```
Raw iPhone Clip (MOV/MP4)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│                  Upload & Transcode                 │
│           ffmpeg: MOV → MP4, normalize audio        │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌────────────────┐          ┌────────────────────┐
│ Whisper (OpenAI)│          │  Gemini Vision      │
│ Audio → words  │          │  Frames → context   │
│ w/ timestamps  │          │  What is shown?     │
└───────┬────────┘          └────────┬───────────┘
        │                            │
        └────────────┬───────────────┘
                     ▼
           ┌──────────────────┐
           │  AI Classifier   │
           │ A-roll vs B-roll │
           │ Scene boundaries │
           └────────┬─────────┘
                    ▼
           ┌──────────────────┐
           │  Remotion Engine │
           │  Captions +      │
           │  Composition     │
           └────────┬─────────┘
                    ▼
              Final MP4 Export
```

---

## 💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, TypeScript, Tailwind CSS v4, Framer Motion |
| **Video Engine** | Remotion 4.0, ffmpeg |
| **AI — Audio** | OpenAI Whisper (transcription) |
| **AI — Vision** | Google Gemini 2.5 (frame analysis) |
| **Auth** | Supabase (email + Google OAuth) |
| **Payments** | Stripe (subscription billing) |
| **Deployment** | Vercel (Edge + Serverless) |
| **Storage** | Supabase Storage |

---

## 🔧 Quick Start

### Prerequisites
- Node.js 20+, pnpm 8+
- ffmpeg installed (`brew install ffmpeg` on Mac)
- Google Gemini API key ([get one](https://console.cloud.google.com))
- OpenAI API key ([get one](https://platform.openai.com))

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/SammyTourani/VibeMotion.git
cd VibeMotion

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys (see table below)

# 4. Start development server
pnpm dev

# 5. Open in browser
open http://localhost:3000
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ Yes | Gemini Vision API key |
| `OPENAI_API_KEY` | ✅ Yes | Whisper transcription |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Supabase service role key |
| `STRIPE_SECRET_KEY` | 💰 For payments | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | 💰 For payments | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | 💰 For payments | Stripe Pro subscription price ID |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 💰 For payments | Stripe publishable key |
| `NEXT_PUBLIC_APP_URL` | ✅ Yes | Your deployment URL |
| `ELEVENLABS_API_KEY` | ⚡ Optional | ElevenLabs voiceover API |
| `REPLICATE_API_TOKEN` | ⚡ Optional | Replicate image generation |

---

## 💰 Pricing

| Plan | Price | Exports | Resolution | Watermark |
|------|-------|---------|-----------|-----------|
| **Free** | $0/month | 3/month | 720p | Yes |
| **Pro** | $12/month | Unlimited | 1080p60 | No |

---

## 🗄️ Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** to get your URL and keys
3. Enable **Google OAuth** in **Authentication → Providers**
4. Set the redirect URL to: `https://your-domain.com/auth/callback`

---

## 🚀 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSammyTourani%2FVibeMotion)

After deploying:
1. Add all environment variables in Vercel Dashboard
2. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL
3. Update Supabase OAuth redirect to your Vercel URL
4. Configure Stripe webhook endpoint: `https://your-domain.vercel.app/api/stripe/webhook`

---

## 📁 Project Structure

```
VibeMotion/
├── app/
│   ├── page.tsx               # Landing page
│   ├── auth/                  # Sign in, sign up, OAuth callback
│   ├── dashboard/             # User project dashboard
│   ├── pricing/               # Pricing page
│   ├── upload/                # Video upload flow
│   ├── generate/[projectId]/  # AI generation + preview
│   └── api/                   # API routes (render, transcribe, etc.)
├── components/
│   ├── landing/               # Landing page components
│   └── ...                    # Editor components
├── lib/
│   └── supabase/              # Supabase client (browser + server)
├── src/
│   ├── components/            # Remotion components
│   └── compositions/          # Video compositions
└── ...
```

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit changes: `git commit -m "feat: add amazing feature"`
4. Push to the branch: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👨‍💻 Built By

**Sammy Tourani** — Software Engineering @ McMaster University

Previously at [Speechify](https://speechify.com), [Boardy.ai](https://boardy.ai), AtkinsRéalis.

- 🔗 [LinkedIn](https://linkedin.com/in/sammytourani) (11K followers)
- 🐦 [Twitter](https://twitter.com/sammytourani)
- 🐙 [GitHub](https://github.com/SammyTourani)

---

*"The best camera is the one you have with you. The best editor should be one that works itself."*
