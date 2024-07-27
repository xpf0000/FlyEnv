import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { build as electronBuild, Platform, CliOptions } from 'electron-builder'
import { copy } from 'fs-extra'
import { resolve } from 'path'

import esbuildConfig from '../configs/esbuild.config'
import viteConfig from '../configs/vite.config'
import electronBuilderConfig from '../configs/electron-builder'

async function packMain() {
  try {
    await copy(
      resolve(__dirname, '../node_modules/nodejieba/dict'),
      resolve(__dirname, '../static/nodejieba')
    )
    await esbuild(esbuildConfig.dist)
    await esbuild(esbuildConfig.distFork)
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
  .then(() => {
    const config = JSON.parse(JSON.stringify(electronBuilderConfig))
    if (process.env.ARCH === 'arm64') {
      config.linux.target = [
        {
          target: 'deb',
          arch: ['arm64']
        },
        {
          target: 'rpm',
          arch: ['arm64']
        }
      ]
    } else if (process.env.ARCH === 'amd64') {
      config.linux.target = [
        {
          target: 'deb',
          arch: ['x64']
        },
        {
          target: 'rpm',
          arch: ['x64']
        }
      ]
    }
    const options: CliOptions = {
      targets: Platform.current().createTarget(),
      config: config
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
