"use client";

import { motion } from "framer-motion";
import { Video, Github, Twitter, Heart } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative py-16 px-6 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/50 to-transparent" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-violet-500/5 rounded-full blur-[100px]" />

      <div className="relative max-w-5xl mx-auto">
        {/* Main footer content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center text-center"
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Video className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/80">
              VibeMotion
            </span>
          </Link>

          {/* Tagline */}
          <p className="text-gray-400 max-w-md mb-4">
            Turn raw iPhone clips into viral-ready videos. AI-powered editing, zero skills needed.
          </p>

          {/* Nav links */}
          <div className="flex flex-wrap items-center justify-center gap-6 mb-8 text-sm text-gray-500">
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/auth/signup" className="hover:text-white transition-colors">Get Started</Link>
            <Link href="/auth/signin" className="hover:text-white transition-colors">Sign In</Link>
            <a href="https://github.com/SammyTourani/VibeMotion" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-4 mb-12">
            {[
              { icon: Github, href: "https://github.com/SammyTourani/VibeMotion", label: "GitHub" },
              { icon: Twitter, href: "https://twitter.com/sammytourani", label: "Twitter" },
            ].map((social) => {
              const Icon = social.icon;
              return (
                <motion.a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label={social.label}
                >
                  <Icon className="w-5 h-5" />
                </motion.a>
              );
            })}
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />

          {/* Bottom section */}
          <div className="flex flex-col md:flex-row items-center justify-between w-full gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              Made with <Heart className="w-4 h-4 text-red-500 fill-red-500" />{" "}
              by{" "}
              <a
                href="https://linkedin.com/in/sammytourani"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Sammy Tourani
              </a>
            </div>
            <div className="flex items-center gap-6">
              <span>Remotion</span>
              <span className="w-1 h-1 bg-gray-600 rounded-full" />
              <span>TypeScript</span>
              <span className="w-1 h-1 bg-gray-600 rounded-full" />
              <span>Next.js 15</span>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
