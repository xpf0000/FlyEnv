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
  loader: {
    '.node': 'file'
  },
  format: 'esm',
  target: 'esnext',
  plugins: [BuildPlugin()],
  drop: ['debugger', 'console']
}

// 与 Windows 保持相同的模块动态加载边界，避免新 worker 静态加载全部业务外部包。
// fork.mjs 仍为固定入口，新 chunk 随 dist/electron/**/* 打包；main/fork 并行构建
// 必须使用不同 chunk 目录，防止两个独立依赖图生成同名文件并相互覆盖。
const forkOutput: Pick<
  BuildOptions,
  'outdir' | 'entryNames' | 'chunkNames' | 'outExtension' | 'splitting'
> = {
  outdir: 'dist/electron',
  entryNames: '[name]',
  chunkNames: 'fork-chunks/[name]-[hash]',
  outExtension: { '.js': '.mjs' },
  splitting: true
}

const devFork: BuildOptions = {
  ...forkOutput,
  platform: 'node',
  entryPoints: { fork: 'src/fork/index.ts' },
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
  ...forkOutput,
  platform: 'node',
  entryPoints: { fork: 'src/fork/index.ts' },
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

export default {
  dev,
  dist,
  devFork,
  distFork
}
