import { join, resolve } from 'path'
import _fs from 'fs-extra'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isLinux } from '../src/shared/utils'

const { mkdirp, writeFile, readFile } = _fs
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
      const fromBinDir = resolve(pack.appOutDir, '../../build/bin/x86')
      const toBinDir = join(pack.appOutDir, 'resources/helper/')
      await mkdirp(toBinDir)
      const command = `cp ./* "${toBinDir}"`
      console.log('command: ', command)
      await execPromise(command, {
        cwd: fromBinDir
      })
    }
    // arm64
    else if (pack.arch === 3) {
      const fromBinDir = resolve(pack.appOutDir, '../../build/bin/arm')
      const toBinDir = join(pack.appOutDir, 'resources/helper/')
      await mkdirp(toBinDir)
      const command = `cp ./* "${toBinDir}"`
      console.log('command: ', command)
      await execPromise(command, {
        cwd: fromBinDir
      })
    }

    let shFile = join(pack.appOutDir, 'resources/helper/flyenv.sh')
    let tmplFile = resolve(pack.appOutDir, '../../static/sh/macOS/fly-env.sh')
    let content = await readFile(tmplFile, 'utf-8')
    await writeFile(shFile, content)

    shFile = join(pack.appOutDir, 'resources/helper/flyenv-helper-init.sh')
    tmplFile = resolve(pack.appOutDir, '../../static/sh/Linux/flyenv-helper-init.sh')
    content = await readFile(tmplFile, 'utf-8')
    await writeFile(shFile, content)

    console.log('afterPack handle end !!!!!!')
    return
  }
  if (pack.arch === 1) {
    const fromBinDir = resolve(pack.appOutDir, '../../build/bin/x86')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/')
    await mkdirp(toBinDir)
    const command = `cp ./* "${toBinDir}"`
    console.log('command: ', command)
    await execPromise(command, {
      cwd: fromBinDir
    })
  }
  // arm64
  else if (pack.arch === 3) {
    const fromBinDir = resolve(pack.appOutDir, '../../build/bin/arm')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/')
    await mkdirp(toBinDir)
    const command = `cp ./* "${toBinDir}"`
    console.log('command: ', command)
    await execPromise(command, {
      cwd: fromBinDir
    })
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
  let content = await readFile(tmplFile, 'utf-8')
  await writeFile(shFile, content)

  shFile = join(pack.appOutDir, 'resources/helper/flyenv-helper-init.sh')
  tmplFile = resolve(pack.appOutDir, '../../static/sh/macOS/flyenv-helper-init.sh')
  content = await readFile(tmplFile, 'utf-8')
  await writeFile(shFile, content)

  console.log('afterPack handle end !!!!!!')
  return
}
