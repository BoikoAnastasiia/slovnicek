'use client'
import { useEffect } from 'react'
import { runSync } from '@/lib/supabase'

export default function SyncBootstrap() {
  useEffect(() => {
    runSync().catch(() => {})
    const onOnline = () => runSync().catch(() => {})
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
