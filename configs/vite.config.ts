import type { UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import * as path from 'path'
import { ViteDevPort } from './vite.port'
import vueJsx from '@vitejs/plugin-vue-jsx'
import wasm from 'vite-plugin-wasm'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { ViteStaticCopyPlugin } from './plugs.vite'
const require = createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))

const renderPath = path.resolve(__dirname, '../src/render/')
const sharePath = path.resolve(__dirname, '../src/shared/')
const langPath = path.resolve(__dirname, '../src/lang/')

const monacoEditorPlugin = require('vite-plugin-monaco-editor').default

const config: UserConfig = {
  base: './',
  plugins: [
    monacoEditorPlugin({}),
    wasm(),
    vue({
      include: [/\.vue$/, /\.md$/] // <-- allows Vue to compile Markdown files
    }),
    vueJsx({
      transformOn: true,
      mergeProps: true
    })
  ],
  esbuild: {
    jsx: 'preserve',
    target: 'esnext',
    supported: {
      'top-level-await': true
    }
  },
  assetsInclude: ['**/*.node'],
  optimizeDeps: {
    esbuildOptions: {
      jsx: 'preserve',
      target: 'esnext',
      supported: {
        'top-level-await': true
      }
    }
  },
  root: renderPath,
  resolve: {
    alias: {
      '@': renderPath,
      '@shared': sharePath,
      '@lang': langPath
    }
  },
  css: {
    // CSS preprocessor
    preprocessorOptions: {
      scss: {}
    }
  }
}

const serverConfig: UserConfig = {
  server: {
    port: ViteDevPort,
    hmr: true
  },
  ...config
}

const serveConfig: UserConfig = {
  server: {
    port: ViteDevPort,
    open: true,
    hmr: true
  },
  ...config
}

const buildConfig: UserConfig = {
  mode: 'production',
  build: {
    outDir: '../../dist/render',
    assetsDir: 'static',
    commonjsOptions: {
      transformMixedEsModules: true,
      ignoreDynamicRequires: true
    },
    rollupOptions: {
      external: [],
      input: {
        main: path.resolve(__dirname, '../src/render/index.html'),
        tray: path.resolve(__dirname, '../src/render/tray.html')
      },
      output: {
        entryFileNames: 'static/js/[name].[hash].js',
        chunkFileNames: 'static/js/[name].[hash].js',
        assetFileNames: 'static/[ext]/[name].[hash].[ext]',
        manualChunks(id) {
          console.log('id: ', id)
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString()
          }
          return undefined
        }
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  ...config
}

// Helper functions for creating Vite configurations for Node.js builds
const createMainConfig = (isDev: boolean): UserConfig => ({
  plugins: [ViteStaticCopyPlugin()],
  build: {
    lib: {
      entry: isDev ? 'src/main/index.dev.ts' : 'src/main/index.ts',
      formats: ['es'],
      fileName: () => 'main.mjs'
    },
    outDir: 'dist/electron',
    minify: !isDev,
    rollupOptions: {
      external: (id) =>
        id.includes('node_modules') ||
        id.startsWith('electron') ||
        id.startsWith('node:') ||
        id.endsWith('.node'),
      output: {
        format: 'es'
      }
    },
    target: 'esnext',
    ssr: true,
    emptyOutDir: false
  },
  esbuild: {
    target: 'esnext',
    ...(isDev ? {} : { drop: ['console', 'debugger'] })
  },
  resolve: {
    alias: {
      '@': renderPath,
      '@shared': sharePath,
      '@lang': langPath
    }
  }
})

const createForkConfig = (isDev: boolean): UserConfig => ({
  build: {
    lib: {
      entry: 'src/fork/index.ts',
      formats: ['es'],
      fileName: () => 'fork.mjs'
    },
    outDir: 'dist/electron',
    minify: !isDev,
    rollupOptions: {
      external: (id) =>
        id.includes('node_modules') ||
        id.startsWith('electron') ||
        id.startsWith('node:') ||
        id.endsWith('.node'),
      output: {
        format: 'es'
      }
    },
    target: 'esnext',
    ssr: true,
    emptyOutDir: false
  },
  esbuild: {
    target: 'esnext',
    ...(isDev ? {} : { drop: ['console', 'debugger'] })
  },
  resolve: {
    alias: {
      '@': renderPath,
      '@shared': sharePath,
      '@lang': langPath
    }
  }
})

const createHelperConfig = (isDev: boolean): UserConfig => ({
  build: {
    lib: {
      entry: 'src/helper/index.ts',
      formats: ['es'],
      fileName: () => 'helper.mjs'
    },
    outDir: 'dist/helper',
    minify: !isDev,
    rollupOptions: {
      external: (id) =>
        id.includes('node_modules') ||
        id.startsWith('electron') ||
        id.startsWith('node:') ||
        id.endsWith('.node'),
      output: {
        format: 'es'
      }
    },
    target: 'esnext',
    ssr: true,
    emptyOutDir: false
  },
  esbuild: {
    target: 'esnext',
    ...(isDev ? {} : { drop: ['console', 'debugger'] })
  },
  resolve: {
    alias: {
      '@': renderPath,
      '@shared': sharePath,
      '@lang': langPath
    }
  }
})

export default {
  serveConfig,
  serverConfig,
  buildConfig,
  // Vite configurations for electron main process and related modules
  // This replaces esbuild entirely - Vite now handles all builds
  // Platform-specific configurations are handled through the mac/win properties
  vite: {
    // macOS and cross-platform configurations (includes helper module)
    mac: {
      dev: createMainConfig(true),
      dist: createMainConfig(false),
      devFork: createForkConfig(true),
      distFork: createForkConfig(false),
      devHelper: createHelperConfig(true),
      distHelper: createHelperConfig(false)
    },

    // Windows configurations (no helper module)
    win: {
      dev: createMainConfig(true),
      dist: createMainConfig(false),
      devFork: createForkConfig(true),
      distFork: createForkConfig(false)
    }
  }
}
