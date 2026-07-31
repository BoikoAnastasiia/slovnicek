import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncAll, type SyncTransport } from './sync'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) client = createClient(url, key)
  return client
}

export async function signInWithGoogle(): Promise<void> {
  await getSupabase()?.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/profile` },
  })
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

export async function getUserId(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function getUserEmail(): Promise<string | null> {
  const supabase = getSupabase()
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
  const supabase = getSupabase()
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
