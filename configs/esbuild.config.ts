import type { BuildOptions } from 'esbuild'
import { BuildPlugin } from './plugs.build'

const dev: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.dev.ts'],
  outfile: 'dist/electron/main.js',
  minify: false,
  bundle: true,
  external: ['electron', 'path', 'fs', 'node-pty'],
  plugins: [BuildPlugin()]
}

const dist: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/electron/main.js',
  minify: true,
  bundle: true,
  external: ['electron', 'path', 'fs', 'node-pty'],
  plugins: [BuildPlugin()],
  drop: ['debugger', 'console']
}

export default {
  dev,
  dist
}
