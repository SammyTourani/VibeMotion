# Transcription Setup Guide

## Phase 3: OpenAI Whisper API

This project uses OpenAI's Whisper API for video transcription with word-level timestamps.

---

## Setup Instructions

### 1. Get an OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Create a new API key
4. Copy the key (starts with `sk-...`)

### 2. Configure the API Key

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` and replace `sk-your-api-key-here` with your actual API key:

```bash
OPENAI_API_KEY=sk-proj-abc123...
```

### 3. Restart the Development Server

```bash
# Stop the current server (Ctrl+C)
# Restart
pnpm dev
```

---

## Cost Information

**OpenAI Whisper API Pricing**: $0.006 per minute of audio

**Hackathon estimates**:
- 1 minute clip = $0.006
- 5 minute clip = $0.03
- 30 minutes total = $0.18
- 1 hour total = $0.36

**Very affordable for demo purposes!**

---

## How to Use

1. **Upload clips** - Upload 3-5 video clips
2. **Click "Transcribe All Clips"** - Wait for processing (takes a few seconds per clip)
3. **View transcripts** - See transcripts appear below the clips
4. **Copy transcripts** - Use the "Copy all" button to copy to clipboard

---

## Features

✅ **Automatic transcription** - Powered by OpenAI Whisper (best-in-class accuracy)
✅ **Word-level timestamps** - Each word has precise start/end times
✅ **Progress tracking** - See which clip is being processed
✅ **Error handling** - Clear error messages if something fails
✅ **Persistent storage** - Transcripts saved in IndexedDB
✅ **Copy to clipboard** - Easy export of all transcripts

---

## Troubleshooting

### "OpenAI API key not configured"

**Solution**: Make sure you created `.env.local` with your API key and restarted the server.

### "Transcription failed"

**Possible causes**:
- Invalid API key
- No API credit remaining (check [usage](https://platform.openai.com/usage))
- Network connection issues
- File format not supported

**Solution**: Check the browser console (F12) for detailed error messages.

### "API key not found" error

**Solution**: Environment variables in Next.js require a server restart to take effect. Stop the dev server (Ctrl+C) and run `pnpm dev` again.

---

## Alternative: Local Whisper (Future)

For production or cost-sensitive use, consider:
- **Whisper.cpp** - Local transcription (free, but requires C++ compilation)
- **Deepgram API** - Alternative transcription service (~$0.0043/min)

For the hackathon, OpenAI Whisper is recommended for simplicity and reliability.

---

## API Key Security

⚠️ **Never commit your `.env.local` file to Git!**

The `.gitignore` file already excludes it, but double-check:

```bash
# Verify .env.local is ignored
git status
# Should NOT show .env.local
```

---

## Next Steps (After Phase 3)

Once transcription is working:

**Phase 4**: AI Chat Integration
- Use transcripts as context for Claude API
- Edit videos through natural language
- "Remove pauses", "Add captions", "Reorder clips"

**Phase 5**: Auto-Stitch & Rendering
- Silence detection and removal
- Automatic caption overlay
- Portrait video export (1080x1920)

---

**Questions?** Check the console logs or contact the development team.
