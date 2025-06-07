import type { BuildOptions } from 'esbuild'
import { BuildPlugin } from './plugs.build'

const dev: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.dev.ts'],
  outfile: 'dist/electron/main.mjs',
  minify: false,
  bundle: true,
  packages: 'external',
  plugins: [BuildPlugin()]
}

const dist: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/electron/main.mjs',
  minify: true,
  bundle: true,
  packages: 'external',
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
  plugins: [BuildPlugin()]
}

const distFork: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/fork/index.ts'],
  outfile: 'dist/electron/fork.mjs',
  minify: true,
  bundle: true,
  packages: 'external',
  plugins: [BuildPlugin()],
  drop: ['debugger', 'console']
}

export default {
  dev,
  dist,
  devFork,
  distFork
}
