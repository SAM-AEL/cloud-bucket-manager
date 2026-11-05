import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: 'src/main/index.ts',
        formats: ['cjs' as const],
        fileName: () => 'index.js'
      },
      rollupOptions: {
        // Keep electron and node builtins external; the AWS SDK gets bundled.
        external: ['electron', /^node:/]
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: 'src/preload/index.ts',
        formats: ['cjs' as const],
        fileName: () => 'index.js'
      },
      rollupOptions: {
        external: ['electron', /^node:/]
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    assetsInclude: ['**/*.svg']
  }
})
