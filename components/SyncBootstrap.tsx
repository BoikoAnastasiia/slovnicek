'use client'
import { useEffect, useRef } from 'react'
import { runSync } from '@/lib/supabase'

// Exponential backoff schedule for transient sync failures. 'offline' and
// 'signed_out' are not retried here: the 'online' event and sign-in already
// re-trigger a sync when those conditions clear.
const BACKOFF_MS = [5000, 15000, 45000]

export default function SyncBootstrap() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let idleHandle: number | null = null
    let usedIdleCallback = false

    function clearPending() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    function scheduleRetry() {
      const delay = BACKOFF_MS[attemptRef.current]
      if (delay === undefined) return // exhausted the schedule; give up until next trigger
      attemptRef.current += 1
      timerRef.current = setTimeout(() => { trigger() }, delay)
    }

    async function trigger() {
      clearPending()
      const status = await runSync().catch(() => 'error' as const)
      if (cancelled) return
      if (status === 'error') {
        scheduleRetry()
      } else {
        attemptRef.current = 0
      }
    }

    // Defer the initial sync until the browser is idle so it doesn't
    // compete with page-load-critical work.
    if (typeof window.requestIdleCallback === 'function') {
      usedIdleCallback = true
      idleHandle = window.requestIdleCallback(() => { trigger() }, { timeout: 4000 })
    } else {
      idleHandle = window.setTimeout(() => { trigger() }, 2500)
    }

    const onOnline = () => {
      attemptRef.current = 0
      trigger()
    }
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      clearPending()
      if (idleHandle !== null) {
        if (usedIdleCallback) {
          window.cancelIdleCallback?.(idleHandle)
        } else {
          clearTimeout(idleHandle)
        }
      }
    }
  }, [])

  return null
}
