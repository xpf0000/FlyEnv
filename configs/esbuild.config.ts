import type { BuildOptions } from 'esbuild'
import { BuildPlugin } from './plugs.build'

const dev: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.dev.ts'],
  outfile: 'dist/electron/main.mjs',
  minify: false,
  bundle: true,
  packages: 'external',
  format: 'esm',
  target: 'esnext',
  plugins: [BuildPlugin()]
}

const dist: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/electron/main.mjs',
  minify: true,
  bundle: true,
  packages: 'external',
  loader: {
    '.node': 'file'
  },
  format: 'esm',
  target: 'esnext',
  plugins: [BuildPlugin()],
  drop: ['debugger', 'console']
}

const devFork: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/fork/index.ts'],
  outfile: 'dist/electron/fork.mjs',
  minify: false,
  bundle: true,
  packages: 'external',
  loader: {
    '.node': 'file'
  },
  format: 'esm',
  target: 'esnext',
  plugins: []
}

const distFork: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/fork/index.ts'],
  outfile: 'dist/electron/fork.mjs',
  minify: true,
  bundle: true,
  packages: 'external',
  loader: {
    '.node': 'file'
  },
  format: 'esm',
  target: 'esnext',
  plugins: [],
  drop: ['debugger', 'console']
}

const devHelper: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/helper/index.ts'],
  outfile: 'dist/helper/helper.js',
  minify: true,
  bundle: true,
  loader: {
    '.node': 'file'
  },
  plugins: [],
  external: [],
  drop: ['debugger', 'console']
}

const distHelper: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/helper/index.ts'],
  outfile: 'dist/helper/helper.js',
  minify: true,
  bundle: true,
  loader: {
    '.node': 'file'
  },
  plugins: [],
  external: [],
  drop: ['debugger', 'console']
}

export default {
  dev,
  dist,
  devFork,
  distFork,
  devHelper,
  distHelper
}
