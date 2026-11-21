import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

function pagesBase(): string {
  const fromEnv = process.env.VITE_BASE
  if (!fromEnv) return '/'
  return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`
}

/**
 * Import `.geojson` as a parsed JSON module (FeatureCollection), not an asset URL.
 * Treating geojson as a static asset URL made builds emit `new URL(...).href`
 * strings, so compareScenario / GeoNeighborhood received a URL and threw RoutingError.
 */
function geojsonAsJson(): Plugin {
  return {
    name: 'geojson-as-json',
    transform(code, id) {
      if (!id.split('?')[0]?.endsWith('.geojson')) return null
      JSON.parse(code)
      return {
        code: `export default ${code}`,
        map: null,
      }
    },
  }
}

export default defineConfig({
  base: pagesBase(),
  plugins: [tailwindcss(), geojsonAsJson(), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // Forward /api/* to @morrow/api when running locally (npm run api:dev).
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  resolve: {
    alias: {
      '@morrow/routing': path.resolve(
        rootDir,
        'packages/routing/src/index.ts',
      ),
    },
  },
})
