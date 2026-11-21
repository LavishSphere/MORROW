import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

function pagesBase(): string {
  const fromEnv = process.env.VITE_BASE
  if (!fromEnv) return '/'
  return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`
}

export default defineConfig({
  base: pagesBase(),
  plugins: [react()],
  assetsInclude: ['**/*.geojson'],
  server: {
    host: '127.0.0.1',
    port: 5173,
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
