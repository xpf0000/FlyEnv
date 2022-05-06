import type { BuildOptions } from 'esbuild'
import { BuildPlugin } from './plugs.build'

const dev: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.dev.js'],
  outfile: 'dist/electron/main.js',
  minify: false,
  bundle: true,
  external: ['electron', 'path', 'fs'],
  plugins: [BuildPlugin()]
}

const dist: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.js'],
  outfile: 'dist/electron/main.js',
  minify: true,
  bundle: true,
  external: ['electron', 'path', 'fs'],
  plugins: [BuildPlugin()]
}

export default {
  dev,
  dist
}
