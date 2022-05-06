import type { NormalizedOutputOptions, OutputBundle, Plugin } from 'rollup'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export const AssetsPlugin: () => Plugin = () => {
  return {
    name: 'vite-assets-plugin',
    writeBundle: function (options: NormalizedOutputOptions, bundle: OutputBundle) {
      const assets: any = {}
      const css = []
      const dir: any = options.dir

      for (const fileName in bundle) {
        if (fileName.includes('/')) {
          const farr = fileName.split('/')
          const file = farr.pop()
          const ext = farr.pop()
          console.log('ext: ', ext)
          if (ext !== 'js' && ext !== 'css') {
            assets['./' + file] = '../' + ext + '/' + file
          }
          if (ext === 'css') {
            css.push(fileName)
          }
        }
      }

      for (const file of css) {
        const path = join(dir, file)
        console.log(path)
        if (existsSync(path)) {
          let content = readFileSync(path, 'utf-8')
          for (const find in assets) {
            const replace = assets[find]
            content = content.replace(new RegExp(find, 'g'), replace)
          }
          writeFileSync(path, content)
          console.log('handle finished !!!')
        }
      }
    }
  }
}
