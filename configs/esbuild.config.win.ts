import type { BuildOptions } from 'esbuild'
import { BuildPlugin } from './plugs.build'

const mainOutput: Pick<
  BuildOptions,
  'outdir' | 'entryNames' | 'chunkNames' | 'outExtension' | 'splitting'
> = {
  outdir: 'dist/electron',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  outExtension: { '.js': '.mjs' },
  splitting: true
}

const dev: BuildOptions = {
  ...mainOutput,
  platform: 'node',
  entryPoints: { main: 'src/main/index.dev.ts' },
  minify: false,
  bundle: true,
  packages: 'external',
  format: 'esm',
  target: 'esnext',
  plugins: [BuildPlugin()]
}

const dist: BuildOptions = {
  ...mainOutput,
  platform: 'node',
  entryPoints: { main: 'src/main/index.ts' },
  minify: true,
  bundle: true,
  packages: 'external',
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
  format: 'esm',
  target: 'esnext',
  plugins: [],
  drop: ['debugger', 'console']
}

export default {
  dev,
  dist,
  devFork,
  distFork
}
