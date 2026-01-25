"use client";

import type { ThemeConfig, VideoStyle, AspectRatio, MusicMood, TextAnimation } from "@/lib/types";

interface ThemeConfigProps {
  theme: ThemeConfig;
  onThemeChange: (theme: ThemeConfig) => void;
}

const styles: { value: VideoStyle; label: string; description: string }[] = [
  { value: "modern", label: "Modern", description: "Clean and contemporary" },
  { value: "minimal", label: "Minimal", description: "Simple and elegant" },
  { value: "bold", label: "Bold", description: "Strong and impactful" },
  { value: "playful", label: "Playful", description: "Fun and energetic" },
  { value: "corporate", label: "Corporate", description: "Professional look" },
  { value: "cinematic", label: "Cinematic", description: "Movie-like feel" },
];

const aspectRatios: { value: AspectRatio; label: string; icon: string }[] = [
  { value: "9:16", label: "Portrait", icon: "📱" },
  { value: "16:9", label: "Landscape", icon: "🖥️" },
  { value: "1:1", label: "Square", icon: "⬜" },
  { value: "4:5", label: "Instagram", icon: "📷" },
];

const musicMoods: { value: MusicMood; label: string; description: string; icon: string }[] = [
  { value: "upbeat", label: "Upbeat", description: "Happy & positive", icon: "🎉" },
  { value: "chill", label: "Chill", description: "Relaxed & calm", icon: "🌊" },
  { value: "dramatic", label: "Dramatic", description: "Intense & cinematic", icon: "🎬" },
  { value: "energetic", label: "Energetic", description: "Fast & exciting", icon: "⚡" },
  { value: "corporate", label: "Corporate", description: "Professional tone", icon: "💼" },
  { value: "none", label: "None", description: "No background music", icon: "🔇" },
];

const textAnimations: { value: TextAnimation; label: string; description: string; icon: string }[] = [
  { value: "pop", label: "Pop", description: "Scale up with spring", icon: "💥" },
  { value: "bounce", label: "Bounce", description: "Bouncy entrance", icon: "🏀" },
  { value: "slide-up", label: "Slide Up", description: "Smooth fade & slide", icon: "⬆️" },
  { value: "typewriter", label: "Typewriter", description: "Character by character", icon: "⌨️" },
  { value: "glow", label: "Glow", description: "Pulsing neon effect", icon: "✨" },
  { value: "shake", label: "Shake", description: "Vibrating emphasis", icon: "📳" },
  { value: "none", label: "None", description: "Simple fade in", icon: "➖" },
];

export default function ThemeConfig({ theme, onThemeChange }: ThemeConfigProps) {
  const updateTheme = (updates: Partial<ThemeConfig>) => {
    onThemeChange({ ...theme, ...updates });
  };

  return (
    <div className="space-y-6">
      {/* Colors */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Brand Colors</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-2">Primary</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.primaryColor}
                onChange={(e) => updateTheme({ primaryColor: e.target.value })}
                className="color-picker"
              />
              <input
                type="text"
                value={theme.primaryColor}
                onChange={(e) => updateTheme({ primaryColor: e.target.value })}
                className="input text-sm flex-1"
                placeholder="#8B5CF6"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Secondary</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.secondaryColor}
                onChange={(e) => updateTheme({ secondaryColor: e.target.value })}
                className="color-picker"
              />
              <input
                type="text"
                value={theme.secondaryColor}
                onChange={(e) => updateTheme({ secondaryColor: e.target.value })}
                className="input text-sm flex-1"
                placeholder="#06B6D4"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Style selection */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Video Style</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {styles.map((style) => (
            <button
              key={style.value}
              onClick={() => updateTheme({ style: style.value })}
              className={`p-3 rounded-lg border text-left transition-all ${
                theme.style === style.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="font-medium text-sm">{style.label}</div>
              <div className="text-xs text-gray-500">{style.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect ratio */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Aspect Ratio</h3>
        <div className="flex gap-2">
          {aspectRatios.map((ratio) => (
            <button
              key={ratio.value}
              onClick={() => updateTheme({ aspectRatio: ratio.value })}
              className={`flex-1 p-3 rounded-lg border text-center transition-all ${
                theme.aspectRatio === ratio.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="text-2xl mb-1">{ratio.icon}</div>
              <div className="text-xs font-medium">{ratio.label}</div>
              <div className="text-xs text-gray-500">{ratio.value}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Background Music */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Background Music</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {musicMoods.map((mood) => (
            <button
              key={mood.value}
              onClick={() => updateTheme({ musicMood: mood.value })}
              className={`p-3 rounded-lg border text-left transition-all ${
                theme.musicMood === mood.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{mood.icon}</span>
                <span className="font-medium text-sm">{mood.label}</span>
              </div>
              <div className="text-xs text-gray-500">{mood.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Text Animation */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Text Animation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {textAnimations.map((anim) => (
            <button
              key={anim.value}
              onClick={() => updateTheme({ textAnimation: anim.value })}
              className={`p-3 rounded-lg border text-left transition-all ${
                theme.textAnimation === anim.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{anim.icon}</span>
                <span className="font-medium text-sm">{anim.label}</span>
              </div>
              <div className="text-xs text-gray-500">{anim.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Sound Effects */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Sound Effects</h3>
        <button
          onClick={() => updateTheme({ sfxEnabled: !theme.sfxEnabled })}
          className={`w-full p-4 rounded-lg border text-left transition-all ${
            theme.sfxEnabled
              ? "border-purple-500 bg-purple-500/10"
              : "border-gray-700 hover:border-gray-600"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{theme.sfxEnabled ? "🔊" : "🔇"}</span>
              <div>
                <div className="font-medium text-sm">
                  {theme.sfxEnabled ? "Sound Effects Enabled" : "Sound Effects Disabled"}
                </div>
                <div className="text-xs text-gray-500">
                  {theme.sfxEnabled
                    ? "Adds whooshes, impacts, and transitions"
                    : "No automatic sound effects"}
                </div>
              </div>
            </div>
            <div
              className={`w-12 h-6 rounded-full transition-colors ${
                theme.sfxEnabled ? "bg-purple-500" : "bg-gray-600"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${
                  theme.sfxEnabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
