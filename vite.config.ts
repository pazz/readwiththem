/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from the domain root on Vercel, and from /readwiththem/ on GitHub
// Pages (the Pages workflow sets BASE_PATH). Manifest URLs are relative to it.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  test: { include: ['src/**/*.test.ts'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The bundled book face too, so titles keep their type offline.
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'] },
      manifest: {
        name: 'Read With Them',
        short_name: 'ReadWithThem',
        description: 'A private reading log for parents and children.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6f6f5',
        theme_color: '#2c5f4f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
