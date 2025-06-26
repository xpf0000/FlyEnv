import type { Plugin } from 'vite'
import { resolve as pathResolve, join } from 'path'
import _fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { isMacOS, isWindows } from '../src/shared/utils'
import { moveChildDirToParent } from '../src/fork/util/Dir'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { copy, remove } = _fs

let hasCopyed = false

export const ViteStaticCopyPlugin: () => Plugin = () => {
  return {
    name: 'vite-static-copy-plugin',
    buildEnd: async () => {
      if (hasCopyed) {
        return
      }

      console.log('Copying static files...')
      const base = pathResolve(__dirname, '../dist/electron/static/')
      await copy(pathResolve(__dirname, '../static/'), base)

      if (isMacOS()) {
        await remove(join(base, 'sh/Windows'))
        await remove(join(base, 'sh/Linux'))

        await remove(join(base, 'tmpl/Windows'))
        await remove(join(base, 'tmpl/Linux'))

        await remove(join(base, 'zip/Windows'))
        await remove(join(base, 'zip/Linux'))

        await moveChildDirToParent(join(base, 'sh'))
        await moveChildDirToParent(join(base, 'tmpl'))
        await moveChildDirToParent(join(base, 'zip'))
      } else if (isWindows()) {
        await remove(join(base, 'sh/macOS'))
        await remove(join(base, 'sh/Linux'))

        await remove(join(base, 'tmpl/macOS'))
        await remove(join(base, 'tmpl/Linux'))

        await remove(join(base, 'zip/macOS'))
        await remove(join(base, 'zip/Linux'))

        await moveChildDirToParent(join(base, 'sh'))
        await moveChildDirToParent(join(base, 'tmpl'))
        await moveChildDirToParent(join(base, 'zip'))
      }

      hasCopyed = true
      console.log('Static files copied successfully!')
    }
  }
}
