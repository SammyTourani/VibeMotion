"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Video, Menu, X } from "lucide-react";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-black/80 backdrop-blur-xl border-b border-white/[0.06]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">VibeMotion</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/#features"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Pricing
          </Link>
          <a
            href="https://github.com/SammyTourani/VibeMotion"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            GitHub
          </a>
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/auth/signin"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium text-white transition-colors"
          >
            Get started free
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden text-gray-400 hover:text-white"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-black/95 backdrop-blur-xl border-b border-white/10 px-4 py-4 space-y-3"
        >
          <Link href="/#features" className="block text-sm text-gray-400 hover:text-white py-2">Features</Link>
          <Link href="/pricing" className="block text-sm text-gray-400 hover:text-white py-2">Pricing</Link>
          <a href="https://github.com/SammyTourani/VibeMotion" className="block text-sm text-gray-400 hover:text-white py-2">GitHub</a>
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <Link href="/auth/signin" className="text-sm text-center py-2.5 rounded-xl bg-white/5 text-gray-300">Sign in</Link>
            <Link href="/auth/signup" className="text-sm text-center py-2.5 rounded-xl bg-violet-600 text-white font-medium">Get started free</Link>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
