import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { Arch, build as electronBuild, Platform } from 'electron-builder'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import viteConfig from '../configs/vite.config'
import esbuildConfig from '../configs/esbuild.config.win'
import electronBuilderConfig from '../configs/electron-builder.win.local'
import { DoFix } from './fix'
import { buildLanguageAssets } from './build-language-assets'
import { isWindows } from '../src/shared/utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function packMain() {
  await DoFix()
  await buildLanguageAssets({
    sourceRoot: path.resolve(__dirname, '../src/lang'),
    outputRoot: path.resolve(__dirname, '../dist/electron/static/lang')
  })
  await esbuild(esbuildConfig.dist)
  await esbuild(esbuildConfig.distFork)
}

async function main() {
  if (!isWindows()) {
    throw new Error('build:win can only be used on Windows')
  }

  const buildStart = Date.now()
  await Promise.all([packMain(), viteBuild(viteConfig.buildConfig)])
  await electronBuild({
    targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
    publish: 'never',
    config: electronBuilderConfig
  })
  console.log(
    '\nUnsigned Windows build completed in',
    Math.floor((Date.now() - buildStart) / 1000),
    's.'
  )
}

main().catch((error) => {
  console.error('\nUnsigned Windows build failed')
  console.error(error)
  process.exitCode = 1
})
