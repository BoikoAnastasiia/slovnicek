import type { SupabaseClient } from '@supabase/supabase-js'
import { syncAll, type SyncTransport } from './sync'

let client: SupabaseClient | null = null
let clientPromise: Promise<SupabaseClient | null> | null = null

export function isSupabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

async function getClient(): Promise<SupabaseClient | null> {
  if (client) return client
  if (!isSupabaseConfigured()) return null
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      client = createClient(url, key)
      return client
    })
  }
  return clientPromise
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await getClient()
  await supabase?.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/profile`,
      queryParams: { prompt: 'select_account' },
    },
  })
}

export async function signOut(): Promise<void> {
  const supabase = await getClient()
  await supabase?.auth.signOut()
}

export async function getUserId(): Promise<string | null> {
  const supabase = await getClient()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function getUserEmail(): Promise<string | null> {
  const supabase = await getClient()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

function supabaseTransport(supabase: SupabaseClient, userId: string): SyncTransport {
  return {
    async push(table, rows) {
      const { error } = await supabase.from(table).upsert(rows.map((r) => ({ ...r, user_id: userId })))
      if (error) throw error
    },
    async pull(table, since) {
      const { data, error } = await supabase
        .from(table).select('*').gt('updated_at', since)
        .order('updated_at', { ascending: true }).limit(1000)
      if (error) throw error
      return data ?? []
    },
  }
}

export async function runSync(): Promise<'ok' | 'offline' | 'signed_out' | 'error'> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  const supabase = await getClient()
  if (!supabase) return 'signed_out'
  const userId = await getUserId()
  if (!userId) return 'signed_out'
  try {
    await syncAll(supabaseTransport(supabase, userId))
    return 'ok'
  } catch {
    return 'error'
  }
}
