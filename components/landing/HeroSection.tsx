"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Upload,
  Sparkles,
  Play,
  Image,
  Video,
  Music,
  FileText,
  X,
  Loader2,
} from "lucide-react";

interface UploadedFile {
  file: File;
  preview: string;
  type: "image" | "video" | "audio" | "text";
}

export default function HeroSection() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 150]);
  const y2 = useTransform(scrollY, [0, 500], [0, -100]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  const getFileType = (file: File): "image" | "video" | "audio" | "text" => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "text";
  };

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles).slice(0, 20 - files.length);

    fileArray.forEach((file) => {
      const type = getFileType(file);
      const preview =
        type === "image" || type === "video"
          ? URL.createObjectURL(file)
          : "";

      setFiles((prev) => {
        if (prev.length >= 20) return prev;
        return [...prev, { file, preview, type }];
      });
    });
  }, [files.length]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const file = prev[index];
      if (file.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setUploadError(null);
    setUploadProgress(null);

    try {
      // Upload files to server if any
      let uploadedAssets: Array<{
        id: string;
        name: string;
        type: string;
        size: number;
        mimeType: string;
        publicPath: string;
      }> = [];

      if (files.length > 0) {
        setUploadProgress(`Uploading ${files.length} asset${files.length > 1 ? "s" : ""}...`);

        const formData = new FormData();
        files.forEach((f, i) => {
          formData.append(`file_${i}`, f.file);
          formData.append(`type_${i}`, f.type);
        });

        const uploadResponse = await fetch("/api/upload-assets", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error || "Failed to upload assets");
        }

        const uploadResult = await uploadResponse.json();

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Upload failed");
        }

        uploadedAssets = uploadResult.assets;
        setUploadProgress(`Uploaded ${uploadedAssets.length} asset${uploadedAssets.length > 1 ? "s" : ""}`);
      }

      // Store project data in sessionStorage for the sandbox
      const projectData = {
        prompt,
        files: uploadedAssets.length > 0
          ? uploadedAssets
          : files.map((f) => ({
              id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: f.file.name,
              type: f.type,
              size: f.file.size,
              mimeType: f.file.type,
              publicPath: null, // No server path for empty uploads
            })),
        timestamp: Date.now(),
      };
      sessionStorage.setItem("pendingProject", JSON.stringify(projectData));

      // Navigate to sandbox
      router.push("/sandbox");
    } catch (error) {
      console.error("Generation error:", error);
      setUploadError(error instanceof Error ? error.message : "An error occurred");
      setIsGenerating(false);
      setUploadProgress(null);
    }
  };

  const FileIcon = ({ type }: { type: string }) => {
    switch (type) {
      case "image":
        return <Image className="w-4 h-4" />;
      case "video":
        return <Video className="w-4 h-4" />;
      case "audio":
        return <Music className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-black to-black" />

      {/* Floating orbs with parallax */}
      <motion.div
        style={{ y: y1 }}
        className="absolute top-20 left-[10%] w-[500px] h-[500px] bg-purple-500/30 rounded-full blur-[120px]"
      />
      <motion.div
        style={{ y: y2 }}
        className="absolute bottom-20 right-[10%] w-[400px] h-[400px] bg-cyan-500/20 rounded-full blur-[100px]"
      />
      <motion.div
        style={{ y: y1 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px]"
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "100px 100px",
        }}
      />

      {/* Content */}
      <motion.div style={{ opacity }} className="relative z-10 w-full max-w-4xl mx-auto px-6">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-sm text-gray-300 font-medium">
              Powered by Remotion MCP + Claude AI
            </span>
          </div>
        </motion.div>

        {/* Main heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold text-center mb-6 tracking-tight"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/80">
            Turn Raw Clips Into
          </span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-purple-400 to-cyan-400">
            Viral Videos
          </span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/60 text-4xl md:text-5xl lg:text-6xl">
            — In Minutes
          </span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg md:text-xl text-gray-400 text-center mb-12 max-w-2xl mx-auto"
        >
          VibeMotion uses AI to transcribe, analyze, and edit your iPhone
          footage automatically.{" "}
          <span className="text-white">No editing skills needed.</span>
        </motion.p>

        {/* Main input card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative"
        >
          {/* Glow effect */}
          <div className="absolute -inset-[2px] bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-500 rounded-2xl opacity-20 blur-lg" />

          {/* Card */}
          <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            {/* Prompt input */}
            <div className="mb-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your video... e.g., 'Create a 30-second product promo for a new sneaker launch with energetic transitions and upbeat music'"
                className="w-full h-32 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
              />
            </div>

            {/* Upload zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer ${
                isDragging
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-white/10 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />

              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-gray-400">
                  <Upload className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">
                    Drop assets here or click to upload
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Images, videos, audio (max 20 files)
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="relative group flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {file.preview && file.type === "image" ? (
                        <img
                          src={file.preview}
                          alt=""
                          className="w-6 h-6 rounded object-cover"
                        />
                      ) : (
                        <FileIcon type={file.type} />
                      )}
                      <span className="text-sm text-gray-300 max-w-[100px] truncate">
                        {file.file.name}
                      </span>
                      <button
                        onClick={() => removeFile(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {files.length < 20 && (
                    <div className="flex items-center gap-2 text-gray-500 text-sm px-3 py-2">
                      <Upload className="w-4 h-4" />
                      Add more ({20 - files.length} left)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error message */}
            {uploadError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {uploadError}
              </div>
            )}

            {/* Generate button */}
            <motion.button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full mt-4 py-4 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-white shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-3"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {uploadProgress || "Initializing..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Video
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Quick examples */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8 flex flex-wrap justify-center gap-2"
        >
          <span className="text-gray-500 text-sm">Try:</span>
          {[
            "Product launch trailer",
            "Tech tutorial intro",
            "Social media ad",
          ].map((example) => (
            <button
              key={example}
              onClick={() => setPrompt(example)}
              className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 transition-all"
            >
              {example}
            </button>
          ))}
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto"
        >
          {[
            { value: "60fps", label: "Smooth Video" },
            { value: "1080p", label: "HD Quality" },
            { value: "<1min", label: "Generation" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
                {stat.value}
              </div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-2 text-gray-500"
        >
          <span className="text-xs">Scroll to explore</span>
          <Play className="w-4 h-4 rotate-90" />
        </motion.div>
      </motion.div>
    </section>
  );
}
