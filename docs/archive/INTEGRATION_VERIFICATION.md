# Integration Verification Plan

**Created**: January 24, 2026
**Status**: Ready for End-to-End Testing
**All 7 Features**: ✅ Complete

---

## Feature Status Summary

| Feature | API Endpoint | UI Component | Status |
|---------|--------------|--------------|--------|
| 1. File System | `/api/write-composition` | Sandbox (auto) | ✅ |
| 2. Asset Upload | `/api/upload-assets` | HeroSection | ✅ |
| 3. Remotion Player | N/A | RemotionPreview | ✅ |
| 4. Render | `/api/render` | Sandbox (button) | ✅ |
| 5. Voiceover | `/api/voiceover` | Sandbox (button) | ✅ |
| 6. Image Gen | `/api/generate-image` | ImageGenerationModal | ✅ |
| 7. Video Gen | `/api/generate-ai-video` | VideoGenerationModal | ✅ |

---

## End-to-End User Flow

### Flow 1: Basic Video Generation (No Assets)
```
1. User → Landing page
2. Enter prompt: "Create a 30-second product promo"
3. Click "Generate Video"
4. → Sandbox page opens
5. → Storyboard generates (streaming)
6. → Code generates (streaming)
7. → Composition writes to disk
8. → Preview shows in Remotion Player
9. User clicks "Render Video"
10. → Render completes
11. → Download button appears
```

### Flow 2: Video with Uploaded Assets
```
1. User → Landing page
2. Enter prompt + Upload 3 images
3. Click "Generate Video"
4. → Files upload to server (/api/upload-assets)
5. → publicPath returned for each asset
6. → Sandbox page opens with assets
7. → Generation includes asset paths
8. → Preview shows uploaded assets
9. User clicks "Render Video"
10. → Final video includes assets
```

### Flow 3: AI-Enhanced Video
```
1. User completes basic generation (Flow 1)
2. Clicks "Generate Image" → ImageGenerationModal
3. Enters prompt, generates AI image
4. Clicks "Add to Assets"
5. Clicks "Generate Video" → VideoGenerationModal
6. Enters prompt, generates AI video clip
7. Clicks "Add to Assets"
8. Clicks "Generate Voiceovers"
9. → ElevenLabs generates audio for scenes
10. Preview updates with voiceover audio
11. User clicks "Render Video"
12. → Final video includes all AI-generated assets
```

---

## Integration Points to Verify

### 1. Landing → Sandbox Data Flow
- [ ] sessionStorage correctly passes `prompt`
- [ ] sessionStorage correctly passes `files` with `publicPath`
- [ ] Sandbox reads and displays assets

### 2. Asset Availability for Generation
- [ ] Uploaded images available at `public/assets/images/`
- [ ] Uploaded videos available at `public/assets/videos/`
- [ ] AI-generated images at `public/assets/images/generated/`
- [ ] AI-generated videos at `public/assets/videos/generated/`

### 3. Storyboard → Code → Preview
- [ ] Storyboard scenes reference uploaded assets
- [ ] Generated code uses `staticFile()` for local assets
- [ ] DynamicPreview renders all scene types

### 4. Voiceover Integration
- [ ] Scenes with `voiceover` text get audio generated
- [ ] Audio files saved to `public/assets/audio/voiceover/`
- [ ] Storyboard updated with `voiceoverAudio` paths
- [ ] Preview plays audio in sync

### 5. Render Pipeline
- [ ] Render API receives storyboard with all asset paths
- [ ] DynamicPreview composition used for render
- [ ] Output video includes all scenes and audio
- [ ] Download link works

---

## API Keys Required

For full functionality, ensure these are in `.env`:

```env
# Required for AI generation
ANTHROPIC_API_KEY=your_key_here

# Required for voiceovers
ELEVENLABS_API_KEY=your_key_here

# Required for image/video generation
REPLICATE_API_TOKEN=your_key_here
```

---

## Testing Commands

```bash
# Start development server
pnpm dev

# Run TypeScript check
pnpm exec tsc --noEmit

# Run linter
pnpm run lint

# Test Remotion Studio (for composition debugging)
pnpm run studio
```

---

## Known Pre-Existing Issues (Not from our features)

1. **FeatureCards.tsx**: Framer Motion `ease: string` type issue
2. **HowItWorks.tsx**: Unused `isInView` variable
3. **CodeEditor.tsx**: Monaco editor module not found

These are cosmetic/type issues and don't affect functionality.

---

## Success Criteria

### Minimum Viable Demo
- [ ] Upload image → Generate video mentioning it → Render
- [ ] Generate video with voiceover → Audio plays in preview
- [ ] Generate AI image → Add to project → Use in video

### Full Demo
- [ ] Complete Flow 1-3 without errors
- [ ] All AI generation features work
- [ ] Final rendered video downloadable
- [ ] < 3 minutes for basic generation
- [ ] < 5 minutes for AI-enhanced video

---

## Recommended Testing Order

1. **Verify server is running**: `pnpm dev` → opens on localhost:3000
2. **Test basic generation**: Enter prompt, no assets, generate
3. **Test asset upload**: Upload 1 image, generate, verify in preview
4. **Test AI image**: Generate image, add to assets
5. **Test AI video**: Generate video, add to assets
6. **Test voiceover**: Generate voiceovers for a scene
7. **Test render**: Render and download final video

---

**Next Action**: Run through Flow 1 (basic generation) to verify integration

