# VibeMotion — Startup Brief

**Version:** 1.0 (February 2026)  
**Founder:** Sammy Tourani  
**Status:** Building in public

---

## The One-Liner

> VibeMotion turns your raw iPhone clips into TikTok/Reels-ready videos in under 2 minutes — no editing skills required.

---

## The Problem

Content creators spend 2-4 hours editing a single 60-second video:
- Raw footage needs trimming, color grading, captions, B-roll
- Manually syncing audio to visual moments is tedious
- TikTok/Reels require specific format, pacing, and style
- Most creators don't have the skills or time

**The result:** Great ideas never become content. 83% of creators say editing is their #1 bottleneck.

---

## The Solution

VibeMotion automates the entire post-production pipeline:

```
Raw iPhone clip (MOV)
       ↓
🎙️ Whisper transcribes every word (word-level timestamps)
       ↓  
👁️ Gemini Vision analyzes every frame (understands context)
       ↓
🧠 AI classifies A-roll vs B-roll (what to show when)
       ↓
📝 Animated TikTok-style captions auto-generated
       ↓
🎬 Remotion renders the final polished MP4
       ↓
✅ Download ready-to-post video
```

What takes 4 hours manually → takes 2 minutes with VibeMotion.

---

## Market Opportunity

- **200M+ content creators** globally, 50M+ posting 3x/week
- **$6.9B** video editing software market by 2030 (13% CAGR)
- **Primary pain:** editing time, not idea generation
- **VibeMotion's angle:** fully automated pipeline (no manual work)

See `MARKET_RESEARCH.md` for full competitive analysis.

---

## Competitive Positioning

| | VibeMotion | Opus Clip | CapCut | Descript |
|---|---|---|---|---|
| Full pipeline | ✅ | ❌ | ⚠️ | ⚠️ |
| AI visual understanding | ✅ | ❌ | ❌ | ❌ |
| Smart B-roll | ✅ | ❌ | Manual | ❌ |
| Developer-friendly | ✅ | ❌ | ❌ | ❌ |
| Price | **$12/mo** | $19/mo | $10/mo | $24/mo |

**Our moat:** End-to-end pipeline + Gemini Vision context understanding. Nobody else does both.

---

## Business Model

### Freemium → Pro Subscription

**Free Tier**
- 3 video exports/month
- 720p resolution
- VibeMotion watermark
- All AI features included

**Pro Tier — $12/month**
- Unlimited exports
- 1080p60 resolution
- No watermark
- Priority render queue
- Export history & dashboard

**Future: Team Tier — $39/month**
- 5 seats
- 4K export
- API access
- White-label

### Unit Economics
- COGS per video: ~$0.15 (Whisper + Gemini + rendering)
- 20 exports/mo on Pro: $0.15 × 20 = $3 COGS
- Revenue: $12/mo
- **Gross margin: 75%**

---

## Traction & Validation

- GitHub repo: https://github.com/SammyTourani/VibeMotion
- Full pipeline built and working (see AUDIT_REPORT.md)
- Tech stack: Next.js 15, TypeScript, Remotion, Gemini, Whisper, ffmpeg

---

## Go-To-Market

### Week 1: Soft Launch
1. **LinkedIn post by Sammy** (11K followers)
   - "I built an AI video editor as a student — here's what it does"
   - Include 60-second demo video made with VibeMotion
   - CTA: "Get early access" → vibemotiontech.com
   - Target: 300+ reactions, 50+ comments, 500+ signups

2. **Twitter/X thread**: Technical breakdown of the AI pipeline
   - Engage AI/ML Twitter: "@karpathy @sama this is what Gemini Vision can do"
   - Target: 200+ retweets from tech community

3. **Reddit posts**:
   - r/MachineLearning: technical post about Gemini Vision + Whisper pipeline
   - r/TikTokHelp, r/ContentCreators: "I automated my video editing"
   - Target: 5-10K organic views

### Month 1: Launch Week
4. **Product Hunt launch** (coordinate with network for Day-1 upvotes)
   - Need 200+ upvotes to rank #1 in AI category
   - Sammy's 11K LinkedIn + McMaster CS community = achievable
   - Target: 5,000 visitors, 500 signups, 50 paid

5. **TikTok/Reels**: Post content made WITH VibeMotion
   - The product markets itself — show don't tell
   - "Made with VibeMotion" on free tier = viral loop

### Month 2-3: Growth
- Creator affiliate program (20% commission)
- Reach out to 10 micro-influencers (50K-200K followers) for free Pro access in exchange for posts
- Build Discord community for power users
- Launch YouTube tutorial: "From iPhone to TikTok in 2 minutes"

---

## Revenue Projections

### Conservative (Sammy does minimal marketing)
| Month | Paid Users | MRR |
|-------|-----------|-----|
| 1 | 10 | $120 |
| 3 | 50 | $600 |
| 6 | 150 | $1,800 |
| 12 | 500 | **$6,000** |

### Base Case (1 viral LinkedIn post)
| Month | Paid Users | MRR |
|-------|-----------|-----|
| 1 | 50 | $600 |
| 3 | 250 | $3,000 |
| 6 | 750 | $9,000 |
| 12 | 2,500 | **$30,000** |

**Break-even:** 85 Pro users  
**Ramen profitable:** 250 Pro users ($3,000 MRR)

---

## Product Roadmap

### Now (0-30 days) — Foundation
- [x] Core AI pipeline (Whisper + Gemini + classification)
- [x] Remotion render pipeline  
- [ ] Supabase auth + user accounts
- [ ] Stripe subscription payments
- [ ] Beautiful landing page
- [ ] Vercel deployment

### Next (30-60 days) — Polish
- [ ] Mobile-responsive editor
- [ ] Template library (10 styles)
- [ ] Batch processing (upload multiple clips)
- [ ] Custom fonts & color schemes
- [ ] Social share buttons (one-click post to TikTok/Reels)

### Later (60-90 days) — Growth
- [ ] Team collaboration
- [ ] Analytics dashboard (view counts, engagement)
- [ ] API access for developers
- [ ] Zapier integration
- [ ] Mobile app (React Native)

### Future (90-180 days) — Scale
- [ ] White-label for agencies
- [ ] AI voiceover in your own voice (voice cloning)
- [ ] Auto-posting to TikTok/Reels/YouTube Shorts
- [ ] Multi-language captions
- [ ] Music licensing marketplace

---

## The Founder

**Sammy Tourani** — 20, Software Engineering @ McMaster University

Past experience:
- **Speechify** — TTS/voice cloning pipelines
- **Boardy.ai** — Semantic cache (Redis + pgvector)
- **AtkinsRéalis** — RAG for nuclear project documentation

Why Sammy can build this:
- Deep AI/ML experience (exactly the stack VibeMotion uses)
- Voice/video pipelines at Speechify = VibeMotion's core tech
- 11K LinkedIn followers = built-in distribution
- Student = low burn rate, long runway

---

## Ask

Not raising right now. Building in public, growing organically.  
If this hits $10K MRR, will consider a pre-seed to accelerate team + infrastructure.

**Contact:** sammy@vibemotiontech.com

---

*"The best camera is the one you have with you. The best editor should be one that works itself."*
