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

// 模块动态 import 必须保留为独立 chunk；单文件 bundle 会把模块专属外部依赖
// 提升成入口静态导入，只停 PHP 的新 worker 也要加载 Image/SQL/FTP 等依赖。
// 固定 fork.mjs 兼容已有资源路径，独立 chunk 目录避免与并行构建的 main 冲突。
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
