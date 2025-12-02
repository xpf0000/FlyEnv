import { join, resolve, dirname } from 'node:path'
import _fs from 'fs-extra'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { isLinux, isWindows } from "../src/shared/utils";


const { mkdirp, copyFile } = _fs
const execPromise = promisify(exec)

/**
 * Handle the app store node-pty Python library linking issue
 * @param {Object} pack - Pack object containing build information
 * @returns {Promise<boolean>}
 */
export default async function after(pack) {
  if (isLinux()) {
    console.log('Linux pack: ', pack)
    /**
     * /home/xpf0000/Desktop/GitHub/FlyEnv/release/linux-unpacked/resources/
     * {
     *   appOutDir: '/home/xpf0000/Desktop/GitHub/FlyEnv/release/linux-unpacked',
     *   outDir: '/home/xpf0000/Desktop/GitHub/FlyEnv/release',
     *   arch: 1,
     *   electronPlatformName: 'linux'
     * }
     */

    if (pack.arch === 1) {
      let fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-linux-amd64-v1')
      const toBinDir = join(pack.appOutDir, 'resources/helper/flyenv-helper')
      await mkdirp(dirname(toBinDir))
      await copyFile(fromBinDir, toBinDir)
    }
    // arm64
    else if (pack.arch === 3) {
      let fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-linux-arm64')
      const toBinDir = join(pack.appOutDir, 'resources/helper/flyenv-helper')
      await mkdirp(dirname(toBinDir))
      await copyFile(fromBinDir, toBinDir)
    }

    let shFile = join(pack.appOutDir, 'resources/helper/flyenv.sh')
    let tmplFile = resolve(pack.appOutDir, '../../static/sh/macOS/fly-env.sh')
    await copyFile(tmplFile, shFile)

    shFile = join(pack.appOutDir, 'resources/helper/flyenv-helper-init.sh')
    tmplFile = resolve(pack.appOutDir, '../../static/sh/Linux/flyenv-helper-init.sh')
    await copyFile(tmplFile, shFile)

    shFile = join(pack.appOutDir, 'resources/helper/512x512.png')
    tmplFile = resolve(pack.appOutDir, '../../static/512x512.png')
    await copyFile(tmplFile, shFile)
    console.log('afterPack handle end !!!!!!')
    return
  }
  if (isWindows()) {
    console.log('Windows pack: ', pack)
    if (pack.arch === 1) {
      let fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe')
      const toBinDir = join(pack.appOutDir, 'resources/helper/flyenv-helper.exe')
      await mkdirp(dirname(toBinDir))
      await copyFile(fromBinDir, toBinDir)
    }
    // arm64
    else if (pack.arch === 3) {
      let fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-windows-arm64.exe')
      const toBinDir = join(pack.appOutDir, 'resources/helper/flyenv-helper.exe')
      await mkdirp(dirname(toBinDir))
      await copyFile(fromBinDir, toBinDir)
    }
    console.log('afterPack handle end !!!!!!')
    return
  }
  if (pack.arch === 1) {
    const fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-darwin-amd64')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv-helper')
    await mkdirp(dirname(toBinDir))
    const command = `cp "${fromBinDir}" "${toBinDir}" && xattr -dr "com.apple.quarantine" "${toBinDir}" && chmod 755 "${toBinDir}"`
    console.log('command: ', command)
    await execPromise(command)
  }
  // arm64
  else if (pack.arch === 3) {
    const fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-darwin-arm64')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv-helper')
    await mkdirp(dirname(toBinDir))
    const command = `cp "${fromBinDir}" "${toBinDir}" && xattr -dr "com.apple.quarantine" "${toBinDir}" && chmod 755 "${toBinDir}"`
    console.log('command: ', command)
    await execPromise(command)
  }

  let fromBinDir = resolve(pack.appOutDir, '../../build/plist')
  let toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/plist/')
  await mkdirp(toBinDir)
  let command = `cp ./* "${toBinDir}"`
  console.log('command: ', command)
  await execPromise(command, {
    cwd: fromBinDir
  })

  let shFile = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv.sh')
  let tmplFile = resolve(pack.appOutDir, '../../static/sh/macOS/fly-env.sh')
  await copyFile(tmplFile, shFile)

  shFile = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv-helper-init.sh')
  tmplFile = resolve(pack.appOutDir, '../../static/sh/macOS/flyenv-helper-init.sh')
  await copyFile(tmplFile, shFile)

  console.log('afterPack handle end !!!!!!')
  return
}
