'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Video, Check, Zap, Crown, HelpCircle, ArrowRight } from 'lucide-react'

const FREE_FEATURES = [
  '3 video exports per month',
  '720p resolution',
  'AI transcription (Whisper)',
  'Gemini Vision B-roll analysis',
  'TikTok animated captions',
  'VibeMotion watermark',
]

const PRO_FEATURES = [
  'Unlimited video exports',
  '1080p60 resolution',
  'AI transcription (Whisper)',
  'Gemini Vision B-roll analysis',
  'TikTok animated captions',
  'No watermark',
  'Priority render queue',
  'Project history & dashboard',
  'Email support',
]

const FAQS = [
  {
    q: 'What counts as an export?',
    a: 'Each time you render and download a final MP4 counts as one export. Previewing your video in the browser is free and doesn\'t count.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, cancel anytime. You\'ll keep Pro access until the end of your billing period, then automatically drop to the Free plan.',
  },
  {
    q: 'What video formats can I upload?',
    a: 'VibeMotion accepts MOV (iPhone), MP4, and most common video formats. We automatically transcode to the best format for editing.',
  },
  {
    q: 'How long does it take to process a video?',
    a: 'Most videos are transcribed, analyzed, and ready for preview in under 2 minutes. Final rendering takes 1-3 minutes depending on length.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. VibeMotion runs entirely in your browser. Just upload your clip and we handle the rest.',
  },
]

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)

  const handleUpgrade = async () => {
    setIsCheckoutLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setIsCheckoutLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-600/8 rounded-full blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">VibeMotion</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/auth/signin" className="text-sm text-gray-400 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium text-white transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      <div className="relative max-w-5xl mx-auto px-4 py-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-4">
            <Zap className="w-3 h-3" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Start free. Go viral.
          </h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            No credit card required to start. Upgrade when you&apos;re ready to remove limits.
          </p>
        </motion.div>

        {/* Pricing cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-20"
        >
          {/* Free */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-400">Free</span>
            </div>
            <div className="flex items-end gap-1 mb-2">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-gray-500 mb-1">/month</span>
            </div>
            <p className="text-sm text-gray-500 mb-6">Perfect for trying VibeMotion</p>

            <Link
              href="/auth/signup"
              className="block w-full text-center py-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors font-medium mb-6"
            >
              Start for free
            </Link>

            <div className="space-y-3">
              {FREE_FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Pro */}
          <div className="relative bg-gradient-to-b from-violet-600/10 to-transparent border border-violet-500/30 rounded-2xl p-8">
            <div className="absolute -top-3 right-6 px-3 py-1 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full text-xs font-bold text-white">
              MOST POPULAR
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-violet-400">Pro</span>
            </div>
            <div className="flex items-end gap-1 mb-2">
              <span className="text-4xl font-bold text-white">$12</span>
              <span className="text-gray-400 mb-1">/month</span>
            </div>
            <p className="text-sm text-gray-400 mb-6">For creators who post regularly</p>

            <button
              onClick={handleUpgrade}
              disabled={isCheckoutLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-medium transition-all flex items-center justify-center gap-2 mb-6 disabled:opacity-50"
            >
              {isCheckoutLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Upgrade to Pro <ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            <div className="space-y-3">
              {PRO_FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-2xl mx-auto"
        >
          <div className="flex items-center gap-2 mb-8 justify-center">
            <HelpCircle className="w-5 h-5 text-gray-500" />
            <h2 className="text-xl font-semibold text-white">Frequently asked questions</h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-sm font-medium text-white">{faq.q}</span>
                  <span className={`text-gray-500 transition-transform ${openFaq === i ? 'rotate-45' : ''}`}>
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-gray-400 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-20"
        >
          <p className="text-gray-400 mb-4">Still not sure? Try it free — no credit card needed.</p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium text-white transition-colors"
          >
            Start free today <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
