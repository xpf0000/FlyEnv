import type { BuildOptions } from 'esbuild'
import { BuildPlugin } from './plugs.build'
const external = [
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
  'dns2',
  'ip',
  'tangerine'
]

const dev: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.dev.ts'],
  outfile: 'dist/electron/main.js',
  minify: false,
  bundle: true,
  external: external,
  plugins: [BuildPlugin()]
}

const dist: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/electron/main.js',
  minify: true,
  bundle: true,
  external: external,
  plugins: [BuildPlugin()],
  drop: ['debugger', 'console']
}

const devFork: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/fork/index.ts'],
  outfile: 'dist/electron/fork.js',
  minify: false,
  bundle: true,
  external,
  plugins: [BuildPlugin()]
}

const distFork: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/fork/index.ts'],
  outfile: 'dist/electron/fork.js',
  minify: true,
  bundle: true,
  external,
  plugins: [BuildPlugin()],
  drop: ['debugger', 'console']
}

const devDNSFork: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/fork/dns.ts'],
  outfile: 'dist/electron/dns.js',
  minify: true,
  bundle: true,
  external,
  plugins: [BuildPlugin()]
}

const distDNSFork: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/fork/dns.ts'],
  outfile: 'dist/electron/dns.js',
  minify: true,
  bundle: true,
  external,
  plugins: [BuildPlugin()]
}

export default {
  dev,
  dist,
  devFork,
  distFork,
  devDNSFork,
  distDNSFork
}
