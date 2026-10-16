import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import assistantDevMiddleware from './server/assistantDevMiddleware'

export default defineConfig({
  plugins: [
    react(),
    // Mounts POST /api/assistant locally using the same handler the Cloudflare
    // Pages Function uses in production (functions/api/assistant.ts). The Gemini
    // key is read from the server environment and never reaches the browser.
    assistantDevMiddleware(),
  ],
  build: {
    // Split rarely-changing dependencies into their own chunks. This keeps the
    // entry bundle small and lets a browser reuse the framework and data-client
    // chunks across deployments instead of re-downloading everything.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          i18n: ['i18next', 'react-i18next'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    // The i18n chunk is legitimately large (three complete translation bundles)
    // and the Supabase client is large by nature. Warn above that, not at 500 kB.
    chunkSizeWarningLimit: 700,
  },
})
