import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Slovníček',
    short_name: 'Slovníček',
    description: 'Personal Slovak vocabulary trainer',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf9f7',
    theme_color: '#2f6f5e',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
