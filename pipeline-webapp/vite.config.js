import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the API runs locally in `wrangler dev` (npm run dev:api) with a local copy of the database.
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
