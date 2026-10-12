import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('./shell', import.meta.url)),
  base: './', envDir: false, publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'] },
  build: { outDir: '../dist', emptyOutDir: true },
})
