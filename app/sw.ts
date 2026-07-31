import { defaultCache } from '@serwist/next/worker'
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

// public/wordbank.json is already offline-precached: @serwist/next's default
// `globPublicPatterns: ['**/*']` scans the whole public/ directory (since we
// don't set `additionalPrecacheEntries` in next.config.mjs) and injects every
// file, including wordbank.json, into __SW_MANIFEST with a real content-hash
// revision that changes automatically whenever the bank is regenerated. That
// is stronger than a manually bumped revision constant, so no extra entry is
// added here — doing so would create a second, conflicting manifest entry for
// the same URL (workbox-precaching rejects duplicate URLs with different
// revisions).
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
