import { join, resolve } from 'path'
import _fs from 'fs-extra'
import { exec } from 'child_process'
import { promisify } from 'util'

const { mkdirp, writeFile, readFile } = _fs
const execPromise = promisify(exec)

/**
 * Handle the app store node-pty Python library linking issue
 * @param {Object} pack - Pack object containing build information
 * @returns {Promise<boolean>}
 */
export default async function after(pack) {
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

  const shFile = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv.sh')
  const tmplFile = resolve(pack.appOutDir, '../../static/sh/macOS/fly-env.sh')
  const content = await readFile(tmplFile, 'utf-8')
  await writeFile(shFile, content)

  console.log('afterPack handle end !!!!!!')
  return
}
