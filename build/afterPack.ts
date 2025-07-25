import { join, resolve, dirname } from 'path'
import _fs from 'fs-extra'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isLinux } from '../src/shared/utils'

const { mkdirp, copyFile } = _fs
const execPromise = promisify(exec)

/**
 * Handle the app store node-pty Python library linking issue
 * @param {Object} pack - Pack object containing build information
 * @returns {Promise<boolean>}
 */
export default async function after(pack) {
  if (isLinux()) {
    console.log('linux pack: ', pack)
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
      let fromBinDir = resolve(pack.appOutDir, '../../build/bin/flyenv-helper-linux-amd64')
      if (!exec(fromBinDir)) {
        const buildSH = resolve(pack.appOutDir, '../../src/helper-go/build-os.sh')
        const command = `cd "${dirname(buildSH)}" && ./build-os.sh "linux amd64 v1"`
        await execPromise(command)
        fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-linux-amd64-v1')
      }
      const toBinDir = join(pack.appOutDir, 'resources/helper/flyenv-helper')
      await mkdirp(dirname(toBinDir))
      await copyFile(fromBinDir, toBinDir)
    }
    // arm64
    else if (pack.arch === 3) {
      let fromBinDir = resolve(pack.appOutDir, '../../build/bin/flyenv-helper-linux-arm64')
      if (!exec(fromBinDir)) {
        const buildSH = resolve(pack.appOutDir, '../../src/helper-go/build-os.sh')
        const command = `cd "${dirname(buildSH)}" && ./build-os.sh "linux arm64"`
        await execPromise(command)
        fromBinDir = resolve(pack.appOutDir, '../../src/helper-go/dist/flyenv-helper-linux-arm64')
      }
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

    console.log('afterPack handle end !!!!!!')
    return
  }
  if (pack.arch === 1) {
    const fromBinDir = resolve(pack.appOutDir, '../../build/bin/flyenv-helper-darwin-amd64')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv-helper')
    await mkdirp(dirname(toBinDir))
    const command = `cp "${fromBinDir}" "${toBinDir}" && xattr -dr "com.apple.quarantine" "${toBinDir}" && chmod 755 "${toBinDir}"`
    console.log('command: ', command)
    await execPromise(command)
  }
  // arm64
  else if (pack.arch === 3) {
    const fromBinDir = resolve(pack.appOutDir, '../../build/bin/flyenv-helper-darwin-arm64')
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
