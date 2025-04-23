const { join, resolve } = require('path')
const { mkdirp, writeFile, readFile } = require('fs-extra')
const { exec } = require('child-process-promise')
/**
 * Handle the app store node-pty Python library linking issue
 * @param pack
 * @returns {Promise<boolean>}
 */
exports.default = async function after(pack) {
  if (pack.arch === 1) {
    const fromBinDir = resolve(pack.appOutDir, '../../build/bin/x86')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/')
    await mkdirp(toBinDir)
    const command = `cp ./* "${toBinDir}"`
    console.log('command: ', command)
    await exec(command, {
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
    await exec(command, {
      cwd: fromBinDir
    })
  }

  let fromBinDir = resolve(pack.appOutDir, '../../build/plist')
  let toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/plist/')
  await mkdirp(toBinDir)
  let command = `cp ./* "${toBinDir}"`
  console.log('command: ', command)
  await exec(command, {
    cwd: fromBinDir
  })

  fromBinDir = resolve(pack.appOutDir, '../../dist/helper')
  toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/')
  await mkdirp(toBinDir)
  command = `cp ./* "${toBinDir}"`
  console.log('command: ', command)
  await exec(command, {
    cwd: fromBinDir
  })

  const shFile = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv.sh')
  const tmplFile = resolve(pack.appOutDir, '../../static/sh/fly-env.sh')
  const content = await readFile(tmplFile, 'utf-8')
  await writeFile(shFile, content)

  console.log('afterPack handle end !!!!!!')
  return true
}
