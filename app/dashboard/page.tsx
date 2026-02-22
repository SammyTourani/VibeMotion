'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Video,
  Plus,
  Clock,
  Download,
  Zap,
  TrendingUp,
  LogOut,
  Crown,
  Play,
  MoreHorizontal,
  ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const MOCK_PROJECTS = [
  {
    id: '1',
    title: 'Morning Routine Vlog',
    duration: '2:34',
    createdAt: '2 hours ago',
    status: 'complete',
    thumbnail: 'from-violet-600 to-purple-700',
  },
  {
    id: '2',
    title: 'Product Review: AirPods Max',
    duration: '4:12',
    createdAt: '1 day ago',
    status: 'complete',
    thumbnail: 'from-blue-600 to-cyan-700',
  },
  {
    id: '3',
    title: 'Day in My Life - McMaster',
    duration: '6:45',
    createdAt: '3 days ago',
    status: 'complete',
    thumbnail: 'from-orange-600 to-amber-700',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/signin')
        return
      }
      setUser(user)
      setIsLoading(false)
    }
    getUser()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Creator'
  const exportsUsed = 1
  const exportsTotal = 3

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">VibeMotion</span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user?.email}</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-500/10 border border-gray-500/20">
              <Zap className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-400 font-medium">Free Plan</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-bold text-white mb-1">
            Hey, {displayName} 👋
          </h1>
          <p className="text-gray-400">Ready to make something viral?</p>
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"
        >
          {[
            {
              icon: Video,
              label: 'Total Videos',
              value: '3',
              color: 'text-violet-400',
              bg: 'bg-violet-500/10',
            },
            {
              icon: TrendingUp,
              label: 'This Month',
              value: '1',
              color: 'text-blue-400',
              bg: 'bg-blue-500/10',
            },
            {
              icon: Download,
              label: 'Total Exports',
              value: '1',
              color: 'text-green-400',
              bg: 'bg-green-500/10',
            },
            {
              icon: Clock,
              label: 'Free Exports Left',
              value: `${exportsTotal - exportsUsed}/${exportsTotal}`,
              color: 'text-amber-400',
              bg: 'bg-amber-500/10',
            },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                variants={itemVariants}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5"
              >
                <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4.5 h-4.5 ${stat.color}`} />
                </div>
                <div className="text-2xl font-bold text-white mb-0.5">{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.label}</div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Upgrade banner */}
        {exportsUsed >= exportsTotal - 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-violet-600/20 to-purple-600/20 border border-violet-500/20 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Crown className="w-5 h-5 text-violet-400" />
              <div>
                <div className="text-sm font-medium text-white">You&apos;re almost out of free exports</div>
                <div className="text-xs text-gray-400">Upgrade to Pro for unlimited exports at 1080p60</div>
              </div>
            </div>
            <Link
              href="/pricing"
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium text-white transition-colors"
            >
              Upgrade — $12/mo <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        )}

        {/* Projects section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Recent Projects</h2>
          <Link
            href="/upload"
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Video
          </Link>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {MOCK_PROJECTS.map((project) => (
            <motion.div
              key={project.id}
              variants={itemVariants}
              className="group bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all"
            >
              {/* Thumbnail */}
              <div className={`relative h-44 bg-gradient-to-br ${project.thumbnail} flex items-center justify-center`}>
                <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 text-white ml-0.5" />
                </div>
                <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/50 rounded text-xs text-white">
                  {project.duration}
                </div>
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-400">
                  {project.status}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white mb-0.5">{project.title}</h3>
                    <p className="text-xs text-gray-500">{project.createdAt}</p>
                  </div>
                  <button className="text-gray-600 hover:text-gray-300 transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition-colors">
                    Preview
                  </button>
                  <button className="flex-1 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-xs text-violet-300 transition-colors">
                    Download
                  </button>
                </div>
              </div>
            </motion.div>
          ))}

          {/* New project card */}
          <motion.div variants={itemVariants}>
            <Link
              href="/upload"
              className="h-full min-h-[240px] flex flex-col items-center justify-center gap-3 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl hover:border-violet-500/30 hover:bg-violet-500/5 transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6 text-violet-400" />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-white mb-0.5">Create new video</div>
                <div className="text-xs text-gray-500">Upload your raw clips</div>
              </div>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
