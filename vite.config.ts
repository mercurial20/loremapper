import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    // PixiJS alone is ~500 kB minified; the editor is a single-page app
    chunkSizeWarningLimit: 1100,
  },
})
