import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
// Serve from a sub-path (e.g. GitHub Pages: /loremapper/) by building with BASE_PATH.
const base = process.env.BASE_PATH ? `/${process.env.BASE_PATH.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/') : '/'

// Cloudflare Web Analytics for the official hosted demo only: the Pages workflow sets
// CF_BEACON_TOKEN from a repository variable. Every other build (dev, Docker, npm, forks)
// leaves it unset and ships no analytics. The app never depends on the beacon loading.
function cloudflareAnalytics(token = process.env.CF_BEACON_TOKEN?.trim()): Plugin {
  return {
    name: 'cloudflare-web-analytics',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!token) return html
        if (!/^[0-9a-f]{32}$/i.test(token)) throw new Error('CF_BEACON_TOKEN must be a 32-character hex site token')
        const beacon = `<!-- Cloudflare Web Analytics --><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script><!-- End Cloudflare Web Analytics -->`
        return html.replace('</body>', `  ${beacon}\n  </body>`)
      },
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), cloudflareAnalytics()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    // PixiJS alone is ~500 kB minified; the editor is a single-page app
    chunkSizeWarningLimit: 1100,
  },
})
