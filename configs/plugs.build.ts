import type { Plugin, PluginBuild } from 'esbuild'
import { resolve } from 'path'
import _fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const { copySync } = _fs

//TODO: remove this once https://github.com/vitejs/vite/pull/2909 gets merged
export const BuildPlugin: () => Plugin = () => {
  return {
    name: 'build-plugin',
    setup(build: PluginBuild) {
      build.onEnd(() => {
        console.log('build end !!!!!!')
        copySync(resolve(__dirname, '../static/'), resolve(__dirname, '../dist/electron/static/'))
      })
    }
  }
}
