import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const src = (path: string) => fileURLToPath(new URL(`../../src/${path}`, import.meta.url))

// The demo imports sizely straight from the repo's source, so edits to the
// library show up instantly with hot reload.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^sizely\/react$/, replacement: src('react.ts') },
      { find: /^sizely\/pdf$/, replacement: src('pdf.ts') },
      { find: /^sizely\/presets$/, replacement: src('presets.ts') },
      { find: /^sizely$/, replacement: src('index.ts') },
    ],
    // The library's own devDependencies include React; use the demo's single copy.
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: ['../..'] } },
})
