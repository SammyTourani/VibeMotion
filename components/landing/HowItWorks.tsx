"use client";

import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { Upload, Wand2, Code, Play, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Upload Your Assets",
    description:
      "Drag and drop your images, videos, logos, and audio files. We support all major formats up to 20 files.",
    gradient: "from-purple-500 to-violet-500",
    bgGlow: "bg-purple-500",
  },
  {
    number: "02",
    icon: Wand2,
    title: "Describe Your Vision",
    description:
      'Write a simple prompt like "Create a 30-second product promo with fast cuts and upbeat music."',
    gradient: "from-cyan-500 to-blue-500",
    bgGlow: "bg-cyan-500",
  },
  {
    number: "03",
    icon: Code,
    title: "Watch AI Create",
    description:
      "AI generates a storyboard, then writes production-ready Remotion TypeScript code in real-time.",
    gradient: "from-orange-500 to-amber-500",
    bgGlow: "bg-orange-500",
  },
  {
    number: "04",
    icon: Play,
    title: "Preview & Export",
    description:
      "Preview your video instantly in the browser, iterate with chat, then render and download.",
    gradient: "from-green-500 to-emerald-500",
    bgGlow: "bg-green-500",
  },
];

export default function HowItWorks() {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 0.5], ["0%", "100%"]);

  return (
    <section className="py-32 px-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-black" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[150px]" />

      <div className="relative max-w-5xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-24"
        >
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-6"
          >
            Simple Process
          </motion.span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/80">
              From Idea to Video
            </span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
              in Four Steps
            </span>
          </h2>
        </motion.div>

        {/* Steps */}
        <div ref={containerRef} className="relative">
          {/* Animated vertical line */}
          <div className="absolute left-[39px] md:left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2">
            <div className="absolute inset-0 bg-white/5" />
            <motion.div
              style={{ height: lineHeight }}
              className="absolute top-0 left-0 right-0 bg-gradient-to-b from-violet-500 via-cyan-500 to-green-500"
            />
          </div>

          <div className="space-y-12 md:space-y-24">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`relative flex items-start gap-8 ${
                    isEven ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  {/* Step indicator */}
                  <div className="relative z-10 flex-shrink-0">
                    <div className={`absolute -inset-2 ${step.bgGlow}/20 rounded-full blur-xl`} />
                    <div
                      className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br ${step.gradient} p-0.5`}
                    >
                      <div className="w-full h-full rounded-2xl bg-black flex items-center justify-center">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    className={`flex-1 pt-2 ${
                      isEven ? "md:text-left md:pr-24" : "md:text-right md:pl-24"
                    }`}
                  >
                    <div
                      className={`inline-block text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${step.gradient} opacity-20 mb-2`}
                    >
                      {step.number}
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                      {step.title}
                    </h3>
                    <p className="text-gray-400 text-lg leading-relaxed max-w-md">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mt-24"
        >
          <motion.a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-xl font-semibold text-white shadow-lg shadow-purple-500/25 transition-all"
          >
            Start Creating Now
            <ArrowRight className="w-5 h-5" />
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
