import type { BuildOptions } from 'esbuild'
import { BuildPlugin } from './plugs.build'
// const external = [
//   'electron',
//   'path',
//   'fs',
//   'node-pty',
//   'fsevents',
//   'mock-aws-s3',
//   'aws-sdk',
//   'nock',
//   'nodejieba',
//   'os',
//   'child_process',
//   'fs-extra',
//   'dns2',
//   'neoip',
//   'tangerine',
//   'lodash',
//   'axios',
//   'iconv-lite',
//   'compressing',
//   'fast-xml-parser',
//   'source-map',
//   'source-map-js',
//   'entities',
//   '@vue',
//   'vue',
//   'vue-i18n',
//   'estree-walker',
//   'serve-handler',
//   'electron-updater',
//   'js-yaml',
//   'atomically',
//   'electron-log',
//   'jszip',
//   'pako',
//   'electron-devtools-installer',
//   'conf',
//   'node-forge',
//   '@ayonli/jsext',
//   'electron-localshortcut',
//   'electron-is',
//   'hpagent',
//   'node-machine-id',
//   '@babel/core',
//   'toml',
//   'original-fs',
//   'iconv-corefoundation'
// ]

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

// const dnsExternal = ['path', 'fs', 'os', 'child_process']

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
  outfile: 'dist/helper/helper.mjs',
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

const distHelper: BuildOptions = {
  platform: 'node',
  entryPoints: ['src/helper/index.ts'],
  outfile: 'dist/helper/helper.mjs',
  minify: true,
  bundle: true,
  packages: 'external',
  loader: {
    '.node': 'file'
  },
  plugins: [],
  format: 'esm',
  target: 'esnext',
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
