// Test-only harness: renders the REAL Website screens in a real browser with
// the auth/company hooks replaced by stubs and the network served by a
// contract fixture (fixture-api.mjs). It is a visual/functional check of this
// frontend, NOT an end-to-end test against the backend.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const stub = (name) => resolve(here, 'stubs', name)

export default defineConfig({
  root: here,
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'website-harness-stubs',
      enforce: 'pre',
      resolveId(source) {
        if (/auth\/AuthProvider(\.jsx)?$/.test(source)) return stub('auth.jsx')
        if (/company\/ActiveCompanyProvider(\.jsx)?$/.test(source)) return stub('company.jsx')
        return null
      },
    },
  ],
  resolve: {
    alias: { 'node:crypto': resolve(here, '../src/shims/node-crypto.js') },
    dedupe: ['react', 'react-dom', '@tanstack/react-query', 'react-router-dom'],
  },
  server: { port: 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [resolve(here, '../../..')] } },
})
