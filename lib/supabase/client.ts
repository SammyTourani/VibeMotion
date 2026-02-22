import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Returns null if Supabase is not configured (graceful degradation)
export function isSupabaseConfigured(): boolean {
  return (
    !!SUPABASE_URL &&
    SUPABASE_URL !== 'https://placeholder.supabase.co' &&
    SUPABASE_URL.includes('.supabase.co') &&
    !!SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'placeholder_anon_key'
  )
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
