import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Keep strict CSP in production; Vite dev injects an inline refresh preamble. */
function devCspPlugin(): Plugin {
  return {
    name: 'feelpost-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['web-tree-sitter'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'scan-worker': resolve('src/main/scanner/scan-worker.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@core': resolve('src/core')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    plugins: [react(), devCspPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  }
})
