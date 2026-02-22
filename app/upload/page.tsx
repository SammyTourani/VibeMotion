"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AssetUploadZone from "@/components/upload/AssetUploadZone";
import AssetGallery from "@/components/upload/AssetGallery";
import ThemeConfig from "@/components/upload/ThemeConfig";
import PromptInput from "@/components/upload/PromptInput";
import type { UploadedAsset, ThemeConfig as ThemeConfigType } from "@/lib/types";
import { DEFAULT_THEME } from "@/lib/types";
import { projectStorage } from "@/lib/project-storage";

export default function UploadPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [theme, setTheme] = useState<ThemeConfigType>(DEFAULT_THEME);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showTheme, setShowTheme] = useState(false);

  // Set body class
  useEffect(() => {
    document.body.classList.add("landing-page");
    document.body.classList.remove("editor-page");
    return () => {
      document.body.classList.remove("landing-page");
    };
  }, []);

  // Create or load project on mount
  useEffect(() => {
    const initProject = async () => {
      try {
        // Check for existing draft project in session
        const savedProjectId = sessionStorage.getItem("currentProjectId");
        if (savedProjectId) {
          const project = await projectStorage.getProject(savedProjectId);
          if (project && project.status === "draft") {
            setProjectId(project.id);
            setAssets(project.assets);
            setTheme(project.theme);
            setPrompt(project.prompt);
            return;
          }
        }

        // Create new project
        const project = await projectStorage.createProject("Untitled Video", DEFAULT_THEME);
        setProjectId(project.id);
        sessionStorage.setItem("currentProjectId", project.id);
      } catch (error) {
        console.error("Failed to initialize project:", error);
      }
    };

    initProject();
  }, []);

  // Save project when state changes
  const saveProject = useCallback(async () => {
    if (!projectId) return;

    try {
      const project = await projectStorage.getProject(projectId);
      if (project) {
        project.assets = assets;
        project.theme = theme;
        project.prompt = prompt;
        await projectStorage.updateProject(project);
      }
    } catch (error) {
      console.error("Failed to save project:", error);
    }
  }, [projectId, assets, theme, prompt]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(saveProject, 500);
    return () => clearTimeout(timeout);
  }, [saveProject]);

  const handleAssetsAdded = (newAssets: UploadedAsset[]) => {
    setAssets((prev) => [...prev, ...newAssets]);
  };

  const handleRemoveAsset = (id: string) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  };

  const handleGenerate = async () => {
    if (!projectId || assets.length === 0 || prompt.trim().length < 10) {
      return;
    }

    setIsGenerating(true);

    try {
      // Update project status
      const project = await projectStorage.getProject(projectId);
      if (project) {
        project.status = "planning";
        await projectStorage.updateProject(project);
      }

      // Navigate to generation page
      router.push(`/generate/${projectId}`);
    } catch (error) {
      console.error("Failed to start generation:", error);
      setIsGenerating(false);
      alert("Failed to start video generation. Please try again.");
    }
  };

  return (
    <div className="min-h-screen animated-gradient">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-xl font-semibold">VibeMotion</span>
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowTheme(!showTheme)}
              className={`btn-secondary text-sm ${showTheme ? "border-purple-500 text-purple-400" : ""}`}
            >
              <svg
                className="w-4 h-4 mr-2 inline"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
              Theme
            </button>
            <Link href="/editor" className="btn-secondary text-sm">
              Manual Editor
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column - Assets */}
          <div className="lg:col-span-2 space-y-6">
            {/* Page title */}
            <div>
              <h1 className="text-3xl font-bold mb-2">Create Your Video</h1>
              <p className="text-gray-400">
                Upload your assets and describe the video you want to create
              </p>
            </div>

            {/* Upload zone */}
            <AssetUploadZone
              onAssetsAdded={handleAssetsAdded}
              currentAssetCount={assets.length}
              maxAssets={20}
            />

            {/* Asset gallery */}
            <AssetGallery assets={assets} onRemoveAsset={handleRemoveAsset} />
          </div>

          {/* Right column - Config & Prompt */}
          <div className="space-y-6">
            {/* Theme config (collapsible) */}
            {showTheme && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-4">Video Theme</h2>
                <ThemeConfig theme={theme} onThemeChange={setTheme} />
              </div>
            )}

            {/* Prompt input */}
            <div className="card sticky top-24">
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                onGenerate={handleGenerate}
                isDisabled={isGenerating}
                assetCount={assets.length}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
