// vite.config.ts
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      // auto register SW + update when new build is available
      registerType: 'autoUpdate',
      // enable PWA during dev so you can verify the manifest in DevTools
      devOptions: { enabled: true },
      // copy extra static assets from /public into dist and let Workbox precache them
      includeAssets: [
        'tiles/pacman-tiles.png',
        'audio/*.wav',
        'sprites/*.png',
        'favicon.ico'
      ],
      workbox: {
        // ensure audio/sprites/etc get precached
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wav,mp3,ogg,json}']
      },
      // ← this replaces your hard-coded /public/manifest.webmanifest
      manifest: {
        name: 'My 2D Game',
        short_name: '2D Game',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
          // (optional) add a maskable icon if you generate one:
          // { src: 'icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: { port: 5173, open: true },
  build: { sourcemap: true }
})
