import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Development proxy: the app calls /api/* on its own origin and Vite
    // forwards it to the backend, so dev needs no CORS and no base URL.
    // Point this at another host by editing here or by setting
    // VITE_API_BASE_URL to call the API cross-origin instead.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
  },
})
