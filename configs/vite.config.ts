import type { UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import * as path from 'path'
import { ViteDevPort } from './vite.port'
import vueJsx from '@vitejs/plugin-vue-jsx'
import wasm from 'vite-plugin-wasm'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

const renderPath = path.resolve(__dirname, '../src/render/')
const sharePath = path.resolve(__dirname, '../src/shared/')
const langPath = path.resolve(__dirname, '../src/lang/')

const config: UserConfig = {
  base: './',
  plugins: [
    monacoEditorPlugin({}),
    wasm(),
    vue({
      include: [/\.vue$/, /\.md$/] // <-- allows Vue to compile Markdown files
    }),
    vueJsx()
  ],
  assetsInclude: ['**/*.node'],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      supported: {
        'top-level-await': true
      }
    },
    exclude: [
      'electron',
      'path',
      'fs',
      'node-pty',
      'fsevents',
      'mock-aws-s3',
      'aws-sdk',
      'nock',
      'nodejieba',
      'os',
      'child_process',
      'child-process-promise',
      'fs-extra',
      'node-forge'
    ]
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
      scss: {
      // Import var.scss so that the predefined variables in var.scss can be used globally
      // Add a semicolon at the end of the imported path
        additionalData: '@import "@/components/Theme/Variables.scss";'
      }
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
    target: 'esnext',
    rollupOptions: {
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

export default {
  serveConfig,
  serverConfig,
  buildConfig
}
