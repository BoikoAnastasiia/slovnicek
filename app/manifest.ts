import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Slovníček',
    short_name: 'Slovníček',
    description: 'Personal Slovak vocabulary trainer',
    start_url: '/',
    display: 'standalone',
    background_color: '#eef0f4',
    theme_color: '#2b7de9',
    icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  }
}
