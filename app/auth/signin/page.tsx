'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Video, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { isSupabaseConfigured } from '@/lib/supabase/client'

function AuthComingSoon() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mx-auto mb-6">
          <Video className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">VibeMotion</h1>
        <p className="text-zinc-400 mb-8">Authentication is coming soon. The core video editor is live now.</p>
        <Link href="/" className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-medium transition-colors">
          Try the editor
        </Link>
      </motion.div>
    </div>
  )
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getSupabase = () => {
    const { createClient } = require('@/lib/supabase/client')
    return createClient()
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setIsLoading(false); return }
    router.push(redirectTo)
    router.refresh()
  }

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    const supabase = getSupabase()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">VibeMotion</span>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
          <p className="text-zinc-400">Sign in to your account</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
          <button onClick={handleGoogleSignIn} disabled={isGoogleLoading} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 px-4 py-3 rounded-xl font-medium transition-colors mb-6 disabled:opacity-50">
            {isGoogleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
            Continue with Google
          </button>
          <div className="relative mb-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-700" /></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-zinc-900/50 text-zinc-500">or</span></div></div>
          <form onSubmit={handleSignIn} className="space-y-4">
            {error && <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
            <div><label className="block text-sm font-medium text-zinc-300 mb-2">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="you@example.com" /></div></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-2">Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" /><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl pl-10 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="Your password" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
            <button type="submit" disabled={isLoading} className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2">{isLoading && <Loader2 className="w-4 h-4 animate-spin" />}Sign in</button>
          </form>
          <p className="text-center text-zinc-500 text-sm mt-6">Don&apos;t have an account? <Link href="/auth/signup" className="text-violet-400 hover:text-violet-300">Sign up free</Link></p>
        </div>
      </motion.div>
    </div>
  )
}

export default function SignInPage() {
  if (!isSupabaseConfigured()) return <AuthComingSoon />
  return <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>}><SignInForm /></Suspense>
}
