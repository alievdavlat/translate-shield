import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: here('.'),
  base: '/',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^translate-shield$/, replacement: here('../dist/index.js') },
      { find: /^translate-shield\/react$/, replacement: here('../dist/react.js') },
    ],
  },
  server: { port: 5201, strictPort: true },
  preview: { port: 5202, strictPort: true },
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        host: here('./index.html'),
        shielded: here('./shielded.html'),
        unshielded: here('./unshielded.html'),
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      },
    },
  },
})
