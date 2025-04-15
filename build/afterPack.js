const { join, resolve } = require('path')
const { mkdirp, writeFile } = require('fs-extra')
const { exec } = require('child-process-promise')
/**
 * 处理appstore node-pty python链接库问题
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
  const content = `# AutoLoad .flyenv
autoload_flyenv() {
  if [[ -f ".flyenv" ]]; then
    echo "Found .flyenv file, loading..."
    source ".flyenv"
    echo "Successfully loaded environment variables from .flyenv"
  fi
}
autoload -Uz add-zsh-hook
add-zsh-hook chpwd autoload_flyenv
autoload_flyenv`
  await writeFile(shFile, content)

  console.log('afterPack handle end !!!!!!')
  return true
}
