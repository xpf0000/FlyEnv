import type { Plugin, PluginBuild } from 'esbuild'
import { resolve } from 'path'
import { copySync } from 'fs-extra'

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
