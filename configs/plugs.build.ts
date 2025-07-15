import type { Plugin, PluginBuild } from 'esbuild'
import { resolve as pathResolve, join } from 'path'
import _fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { isLinux, isMacOS, isWindows } from '../src/shared/utils'
import { moveChildDirToParent } from '../src/fork/util/Dir'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { copy, remove } = _fs

let hasCopyed = false

//TODO: remove this once https://github.com/vitejs/vite/pull/2909 gets merged
export const BuildPlugin: () => Plugin = () => {
  return {
    name: 'build-plugin',
    setup(build: PluginBuild) {
      build.onEnd(() => {
        if (hasCopyed) {
          return Promise.resolve()
        }
        return new Promise(async (resolve) => {
          console.log('build end !!!!!!')
          const base = pathResolve(__dirname, '../dist/electron/static/')
          await copy(pathResolve(__dirname, '../static/'), base)
          if (isMacOS()) {
            await remove(join(base, 'sh/Windows'))
            await remove(join(base, 'sh/Linux'))

            await remove(join(base, 'tmpl/Windows'))
            await remove(join(base, 'tmpl/Linux'))

            await remove(join(base, 'zip/Windows'))
            await remove(join(base, 'zip/Linux'))
          } else if (isWindows()) {
            await remove(join(base, 'sh/macOS'))
            await remove(join(base, 'sh/Linux'))

            await remove(join(base, 'tmpl/macOS'))
            await remove(join(base, 'tmpl/Linux'))

            await remove(join(base, 'zip/macOS'))
            await remove(join(base, 'zip/Linux'))
          } else if (isLinux()) {
            await remove(join(base, 'sh/macOS'))
            await remove(join(base, 'sh/Windows'))

            await remove(join(base, 'tmpl/macOS'))
            await remove(join(base, 'tmpl/Windows'))

            await remove(join(base, 'zip/macOS'))
            await remove(join(base, 'zip/Windows'))
          }
          await moveChildDirToParent(join(base, 'sh'))
          await moveChildDirToParent(join(base, 'tmpl'))
          await moveChildDirToParent(join(base, 'zip'))
          hasCopyed = true
          resolve()
        })
      })
    }
  }
}
