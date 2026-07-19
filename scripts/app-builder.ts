import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { Arch, build as electronBuild, Platform } from 'electron-builder'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import viteConfig from '../configs/vite.config'
import { DoFix } from './fix'
import { isLinux, isMacOS, isWindows } from '../src/shared/utils'
import { buildLanguageAssets } from './build-language-assets'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const windowsBuildStage = process.env.FLYENV_WINDOWS_BUILD_STAGE

if (windowsBuildStage && !['app', 'installers'].includes(windowsBuildStage)) {
  throw new Error(`Unsupported FLYENV_WINDOWS_BUILD_STAGE: ${windowsBuildStage}`)
}

async function packMain() {
  await DoFix()
  await buildLanguageAssets({
    sourceRoot: path.resolve(__dirname, '../src/lang'),
    outputRoot: path.resolve(__dirname, '../dist/electron/static/lang')
  })
  if (isMacOS() || isLinux()) {
    console.log('packMain isMacOS !!!')
    const config = (await import('../configs/esbuild.config')).default
    await esbuild(config.dist)
    await esbuild(config.distFork)
  } else if (isWindows()) {
    console.log('packMain isWindows !!!')
    const config = (await import('../configs/esbuild.config.win')).default
    await esbuild(config.dist)
    await esbuild(config.distFork)
  }
}

async function packRenderer() {
  await viteBuild(viteConfig.buildConfig)
}

async function packElectron() {
  const options: any = {
    targets: Platform.current().createTarget(),
    publish: 'never'
  }
  if (isMacOS()) {
    console.log('electron-builder isMacOS !!!')
    options.config = (await import('../configs/electron-builder')).default
  } else if (isWindows()) {
    console.log(`electron-builder isWindows stage=${windowsBuildStage || 'default'} !!!`)
    const config = (await import('../configs/electron-builder.win')).default
    options.config = config

    if (windowsBuildStage === 'app') {
      // Building the portable target also places resources/elevate.exe into win-unpacked.
      // The disposable outer executable is overwritten by the final installer stage.
      options.targets = Platform.WINDOWS.createTarget('portable', Arch.x64)
    } else if (windowsBuildStage === 'installers') {
      const prepackaged = process.env.FLYENV_PREPACKAGED_APP_DIR
      if (!prepackaged) {
        throw new Error('FLYENV_PREPACKAGED_APP_DIR is required for the installers stage')
      }
      const prepackagedPath = path.resolve(prepackaged)
      if (!existsSync(prepackagedPath)) {
        throw new Error(`Prepackaged Windows app not found: ${prepackagedPath}`)
      }
      options.prepackaged = prepackagedPath
      options.targets = Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.x64)
      options.config = {
        ...config,
        nsis: { ...config.nsis, packElevateHelper: false },
        // useZip bypasses AppPackageHelper.packArch, whose elevate-helper copy would
        // otherwise overwrite the signed resources/elevate.exe in the prepackaged app.
        portable: { ...config.portable, useZip: true }
      }
    }
  } else if (isLinux()) {
    console.log('electron-builder isLinux !!!')
    options.config = (await import('../configs/electron-builder.linux')).default
  }

  await electronBuild(options)
}

async function main() {
  const buildStart = Date.now()
  const packageOnly = isWindows() && windowsBuildStage === 'installers'
  if (!packageOnly) {
    await Promise.all([packMain(), packRenderer()])
  }
  await packElectron()
  console.log('\nBuild completed in', Math.floor((Date.now() - buildStart) / 1000) + ' s.')
}

main().catch((error) => {
  console.error('\nBuild failed')
  console.error(error)
  process.exitCode = 1
})
