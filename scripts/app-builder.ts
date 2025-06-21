import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { build as electronBuild, Platform } from 'electron-builder'

import viteConfig from '../configs/vite.config'
import { DoFix } from './fix'
import { isMacOS, isWindows } from '../src/shared/utils'

async function packMain() {
  try {
    await DoFix()
    if (isMacOS()) {
      const config = (await import('../configs/esbuild.config')).default
      await esbuild(config.dist)
      await esbuild(config.distFork)
      await esbuild(config.distHelper)
    } else if (isWindows()) {
      console.log('isWindows !!!')
      const config = (await import('../configs/esbuild.config.win')).default
      await esbuild(config.dist)
      await esbuild(config.distFork)
    }
  } catch (err) {
    console.log('\nfailed to build main process')
    console.error(`\n${err}\n`)
    process.exit(1)
  }
}

async function packRenderer() {
  try {
    return viteBuild(viteConfig.buildConfig)
  } catch (err) {
    console.log('\nfailed to build renderer process')
    console.error(`\n${err}\n`)
    process.exit(1)
  }
}

const buildStart = Date.now()

Promise.all([packMain(), packRenderer()])
  .then(async () => {
    const options: any = {
      targets: Platform.current().createTarget()
    }
    if (isMacOS()) {
      const config = (await import('../configs/electron-builder')).default
      options.config = config as any
    } else if (isWindows()) {
      const config = (await import('../configs/electron-builder.win')).default
      options.config = config as any
    }

    electronBuild(options)
      .then(() => {
        console.log('\nBuild completed in', Math.floor((Date.now() - buildStart) / 1000) + ' s.')
      })
      .catch((e) => {
        console.error(e)
      })
  })
  .catch((e) => console.log(e))
