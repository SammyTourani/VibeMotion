"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ArrowRight, Zap, Crown } from "lucide-react";

const FREE_PERKS = ["3 exports/month", "AI transcription", "TikTok captions"];
const PRO_PERKS = ["Unlimited exports", "1080p60 resolution", "No watermark"];

export default function PricingTeaser() {
  return (
    <section className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/10 to-transparent" />

      <div className="relative max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Start free. Upgrade when you&apos;re ready.
          </h2>
          <p className="text-gray-400 text-lg">
            No credit card required. Cancel anytime.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid md:grid-cols-2 gap-5 max-w-2xl mx-auto"
        >
          {/* Free */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-7">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-white">Free</span>
            </div>
            <div className="text-3xl font-bold text-white mb-4">
              $0<span className="text-base font-normal text-gray-500">/mo</span>
            </div>
            <div className="space-y-2.5 mb-6">
              {FREE_PERKS.map((perk) => (
                <div key={perk} className="flex items-center gap-2.5 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-gray-500" />
                  {perk}
                </div>
              ))}
            </div>
            <Link
              href="/auth/signup"
              className="block w-full text-center py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors text-sm font-medium"
            >
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className="relative bg-gradient-to-b from-violet-600/15 to-transparent border border-violet-500/30 rounded-2xl p-7">
            <div className="absolute -top-3 right-5 px-3 py-0.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full text-[11px] font-bold text-white">
              PRO
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-4 h-4 text-violet-400" />
              <span className="font-semibold text-white">Pro</span>
            </div>
            <div className="text-3xl font-bold text-white mb-4">
              $12<span className="text-base font-normal text-gray-400">/mo</span>
            </div>
            <div className="space-y-2.5 mb-6">
              {PRO_PERKS.map((perk) => (
                <div key={perk} className="flex items-center gap-2.5 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-violet-400" />
                  {perk}
                </div>
              ))}
            </div>
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
            >
              See all features <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
