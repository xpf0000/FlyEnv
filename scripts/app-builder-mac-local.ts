import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { Arch, build as electronBuild, Platform } from 'electron-builder'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import viteConfig from '../configs/vite.config'
import esbuildConfig from '../configs/esbuild.config'
import electronBuilderConfig from '../configs/electron-builder.mac.local'
import { DoFix } from './fix'
import { buildLanguageAssets } from './build-language-assets'
import { isMacOS } from '../src/shared/utils'

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
  if (!isMacOS()) {
    throw new Error('build:mac can only be used on macOS')
  }

  const buildStart = Date.now()
  await Promise.all([packMain(), viteBuild(viteConfig.buildConfig)])
  await electronBuild({
    targets: Platform.MAC.createTarget('dmg', Arch.arm64),
    publish: 'never',
    config: electronBuilderConfig
  })
  console.log(
    '\nUnsigned macOS ARM64 build completed in',
    Math.floor((Date.now() - buildStart) / 1000),
    's.'
  )
}

main().catch((error) => {
  console.error('\nUnsigned macOS ARM64 build failed')
  console.error(error)
  process.exitCode = 1
})
