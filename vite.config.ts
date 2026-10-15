import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import assistantDevMiddleware from './server/assistantDevMiddleware'

export default defineConfig({
  plugins: [
    react(),
    // Mounts POST /api/assistant locally using the same handler the Vercel
    // serverless function uses in production. Reads GEMINI_API_KEY server-side.
    assistantDevMiddleware(),
  ],
})
