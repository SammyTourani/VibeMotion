"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import {
  Sparkles,
  Mic,
  Image,
  Video,
  MessageSquare,
  Zap,
  Code,
  Layers,
} from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI Storyboarding",
    description:
      "Describe your video and AI creates a professional scene-by-scene storyboard with hooks, transitions, and timing.",
    gradient: "from-purple-500 to-pink-500",
    bgGlow: "bg-purple-500/20",
  },
  {
    icon: Code,
    title: "Live Code Generation",
    description:
      "Watch AI write production-ready Remotion TypeScript code in real-time, just like in a professional IDE.",
    gradient: "from-cyan-500 to-blue-500",
    bgGlow: "bg-cyan-500/20",
  },
  {
    icon: Mic,
    title: "ElevenLabs Audio",
    description:
      "AI-generated voiceovers, sound effects, and background music perfectly synced to your video.",
    gradient: "from-orange-500 to-yellow-500",
    bgGlow: "bg-orange-500/20",
  },
  {
    icon: Image,
    title: "Image Generation",
    description:
      "Generate custom visuals with AI when you need them. Perfect for backgrounds, graphics, and overlays.",
    gradient: "from-green-500 to-emerald-500",
    bgGlow: "bg-green-500/20",
  },
  {
    icon: Video,
    title: "Remotion Rendering",
    description:
      "Professional video rendering powered by Remotion. Export in 1080p, 4K, or any format you need.",
    gradient: "from-violet-500 to-purple-500",
    bgGlow: "bg-violet-500/20",
  },
  {
    icon: MessageSquare,
    title: "Chat Refinement",
    description:
      "Not quite right? Chat with AI to refine your video. Make it faster, change the music, adjust timing.",
    gradient: "from-red-500 to-pink-500",
    bgGlow: "bg-red-500/20",
  },
  {
    icon: Layers,
    title: "Component Library",
    description:
      "Pre-built TitleSlides, ContentSlides, Transitions, and more. AI knows exactly how to use them.",
    gradient: "from-indigo-500 to-violet-500",
    bgGlow: "bg-indigo-500/20",
  },
  {
    icon: Zap,
    title: "One-Click Export",
    description:
      "Export directly to TikTok, Instagram Reels, and YouTube Shorts formats with optimized settings.",
    gradient: "from-amber-500 to-orange-500",
    bgGlow: "bg-amber-500/20",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

export default function FeatureCards() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-32 px-6 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900/50 to-black" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-[150px]" />

      <div className="relative max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-6"
          >
            Everything You Need
          </motion.span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/80">
              A Complete AI Video
            </span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
              Generation Suite
            </span>
          </h2>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
            Built for creators who want professional results without the
            learning curve.
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                variants={cardVariants}
                className="group relative"
              >
                {/* Card glow on hover */}
                <div
                  className={`absolute -inset-[1px] ${feature.bgGlow} rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500`}
                />

                {/* Card */}
                <div className="relative h-full bg-gray-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all duration-300">
                  {/* Icon */}
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} p-2.5 mb-4 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-full h-full text-white" />
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-white/80 transition-all">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
