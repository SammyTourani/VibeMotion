# VibeMotion — AI Video Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://typescriptlang.org)
[![Remotion](https://img.shields.io/badge/Remotion-4.0-orange)](https://remotion.dev)

> Turn raw phone clips into social-ready videos with an autonomous AI pipeline: transcription, visual analysis, A/B-roll classification, storyboard, and a Remotion composition you can preview and render.

VibeMotion started as a hackathon project ("Stan Hackathon"). The core video-generation pipeline is real and end-to-end; the SaaS shell around it (auth, dashboard, payments) is partly scaffolded. See **[Status: what's real vs scaffolded](#status-whats-real-vs-scaffolded)** below for an honest breakdown before you rely on anything.

---

## What it does

You upload a clip. The pipeline transcribes the audio, looks at the frames, decides which segments are A-roll vs B-roll, builds a storyboard, and generates a Remotion composition you can preview live in the browser. You can optionally generate an AI voiceover, pull in AI-generated images/video, and render a final MP4.

---

## Features

### AI pipeline (real, implemented in `lib/pipeline/`)
- **Whisper transcription** — word-level timestamps via the OpenAI API.
- **Gemini frame analysis** — frames are sent to `gemini-2.0-flash` to understand what's on screen, not just the audio.
- **A/B-roll classification** — the pipeline classifies segments and proposes a smart storyboard.
- **Remotion composition codegen** — the storyboard is turned into a Remotion composition.
- **Live Remotion preview** — see the composition render in the browser before export.
- **AI voiceover** — optional ElevenLabs TTS.
- **AI image/video generation** — optional, via Replicate.

### MP4 render (local-first)
- Final MP4 export spawns the Remotion CLI (`@remotion/cli` + `ffmpeg-static`). This works locally. It is **not** a clean Vercel-serverless render path — running it on serverless would require additional work.

### Platform shell (partly scaffolded — read the status section)
- **Supabase auth** — email + Google OAuth, with a protected `/dashboard` route, when Supabase env vars are configured. If they're not set, auth silently disables.
- **Dashboard** — renders a project list and usage stats.
- **Stripe checkout** — a checkout route exists.

---

## Status: what's real vs scaffolded

This is the part most READMEs skip. Here's the honest state of each piece:

| Area | Status | Detail |
|------|--------|--------|
| Transcription → analysis → classification → storyboard → composition | **Real** | Implemented end-to-end in `lib/pipeline/`. |
| Whisper transcription | **Real** | Server-side OpenAI call. (No verified accuracy/language numbers — claims removed.) |
| Gemini vision | **Real** | Pinned to `gemini-2.0-flash` across `lib/pipeline/*` and `app/api/*`. |
| ElevenLabs voiceover / Replicate gen | **Real, optional** | Wired; require their respective keys. |
| Remotion live preview | **Real** | In-browser player. |
| MP4 render | **Real, local-first** | Spawns the Remotion CLI; works locally, not a serverless path. |
| Supabase auth + protected dashboard route | **Partial** | Works when configured; silently disabled when not. |
| Dashboard project list | **Scaffolded / mock** | Uses a hardcoded `MOCK_PROJECTS` array and a hardcoded `exportsUsed = 1` — it is not reading real per-user data. |
| Project history | **Browser-only** | Stored in IndexedDB on the client (`lib/project-storage.ts`), not in Supabase. History does not sync across devices. |
| Stripe payments | **Scaffolded** | `app/api/stripe/checkout/route.ts` returns a mock response unless `STRIPE_SECRET_KEY` is set. There is **no webhook handler and no quota/export-limit enforcement**, so the "freemium limits" are not actually enforced. |

If you're evaluating this as a product, treat the pipeline as the real deliverable and the auth/dashboard/billing layer as a work-in-progress shell.

---

## Architecture

```
Raw clip (MOV/MP4)
        │
        ▼
   Upload & transcode
        │
   ┌────┴─────────────────────┐
   ▼                          ▼
Whisper (OpenAI)        Gemini frame analysis
audio → words           frames → on-screen context
        │                     │
        └──────────┬──────────┘
                   ▼
           A/B-roll classifier
           + smart storyboard
                   ▼
        Remotion composition codegen
                   ▼
        Live preview  →  optional MP4 render (Remotion CLI, local)
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Framer Motion |
| Video engine | Remotion 4.0, ffmpeg (`ffmpeg-static`) |
| AI — audio | OpenAI Whisper (transcription) |
| AI — vision | Google Gemini (`gemini-2.0-flash`) |
| AI — extras | ElevenLabs (voiceover), Replicate (image/video gen) |
| Auth | Supabase (email + Google OAuth) |
| Payments | Stripe (checkout only; see status) |
| Storage | Supabase (auth); project history in browser IndexedDB |

---

## Quick start

### Prerequisites
- Node.js 20+, pnpm 8+
- ffmpeg available locally (`brew install ffmpeg` on macOS) for transcode/render
- A Google Gemini API key ([get one](https://console.cloud.google.com))
- An OpenAI API key ([get one](https://platform.openai.com))

### Setup

```bash
# 1. Clone
git clone https://github.com/SammyTourani/VibeMotion.git
cd VibeMotion

# 2. Install
pnpm install

# 3. Configure env
cp .env.example .env.local
# Edit .env.local — see the table below

# 4. Run
pnpm dev
# http://localhost:3000
```

---

## Environment variables

Only these are read by the code. (Earlier versions of this README listed
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — no source file reads them, so they've been
dropped.)

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Gemini API key (frame analysis + storyboard) |
| `OPENAI_API_KEY` | Yes | Whisper transcription (server-side) |
| `NEXT_PUBLIC_SUPABASE_URL` | For auth | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For auth | Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployment URL (no trailing slash) |
| `STRIPE_SECRET_KEY` | For payments | Stripe secret key; without it, checkout returns a mock |
| `STRIPE_PRO_PRICE_ID` | For payments | Stripe Pro price ID |
| `ELEVENLABS_API_KEY` | Optional | ElevenLabs voiceover |
| `REPLICATE_API_TOKEN` | Optional | Replicate image/video generation |

> Do not set a `NEXT_PUBLIC_OPENAI_API_KEY`. `UploadPanel.tsx` references it only
> as a client-side heuristic to show a "key may not be configured" warning; it is
> never used to make browser-side OpenAI calls. Setting it would expose a secret
> to the client. Transcription runs server-side via `OPENAI_API_KEY`.

---

## Supabase setup (optional, for auth + dashboard)

1. Create a project at [supabase.com](https://supabase.com).
2. **Settings → API** for your URL and anon key.
3. Enable **Google OAuth** under **Authentication → Providers**.
4. Set the redirect URL to `https://your-domain.com/auth/callback`.

If you skip this, the app runs without auth and the protected `/dashboard` route is effectively disabled.

---

## Deploy to Vercel

1. Add the environment variables above in the Vercel dashboard.
2. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL.
3. Update the Supabase OAuth redirect to your Vercel URL.

Note: MP4 render spawns the Remotion CLI locally and is not a clean serverless path, so a one-click Vercel deploy gives you the app and pipeline UI but not turnkey serverless rendering.

---

## Project structure

```
VibeMotion/
├── app/
│   ├── page.tsx               # Landing page
│   ├── auth/                  # Sign in, sign up, OAuth callback
│   ├── dashboard/             # Dashboard (currently mock project data)
│   ├── pricing/               # Pricing page
│   ├── upload/                # Upload flow
│   ├── generate/[projectId]/  # Generation + preview
│   └── api/                   # API routes (pipeline, stripe/checkout, etc.)
├── components/                # App + editor components
├── lib/
│   ├── pipeline/              # The real AI pipeline
│   ├── supabase/              # Supabase clients (browser + server)
│   └── project-storage.ts     # Browser IndexedDB project history
├── src/
│   ├── components/            # Remotion components
│   └── compositions/          # Video compositions
└── docs/DOMAIN_SETUP.md       # Domain setup notes
```

---

## Contributing

1. Fork the repo.
2. Create a branch: `git checkout -b feat/your-feature`.
3. Commit: `git commit -m "feat: ..."`.
4. Push and open a PR.

---

## Credits

VibeMotion is built on [**claude-remotion-kickstart**](https://github.com/jhartquist/claude-remotion-kickstart) by **John Hartquist** — the open-source Claude + Remotion starter that provides the Remotion component library and video-composition engine (`src/components/`, `src/compositions/`). VibeMotion adds the autonomous AI pipeline (`lib/pipeline/`), the SaaS shell (auth, dashboard, billing), and the landing/marketing layer on top.

> **Remotion licensing:** Remotion itself has [separate licensing terms](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md). Companies with 3+ employees need a Remotion company license to render videos.

## License

MIT — see [LICENSE](LICENSE). Copyright is retained by John Hartquist for the base template and Sammy Tourani for the VibeMotion additions.

---

## Built by

**Sammy Tourani** — Software Engineering @ McMaster University

- [LinkedIn](https://linkedin.com/in/sammytourani)
- [GitHub](https://github.com/SammyTourani)
