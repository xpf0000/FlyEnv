import { isArmArch, isLinux, isMacOS } from '@shared/utils'
import { userInfo } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { existsSync } from 'node:fs'
import { spawnPromiseWithEnv } from '@shared/child-process'

/**
 * 检查 macOS Brew
 */
const checkMacOSBrew = (sendGlobalUpdate: () => void) => {
  const brewBin = isArmArch() ? '/opt/homebrew/bin/brew' : '/usr/local/Homebrew/bin/brew'
  runBrewChecks([brewBin], sendGlobalUpdate)
}

/**
 * 检查 Linux Brew
 */
const checkLinuxBrew = (sendGlobalUpdate: () => void) => {
  const uinfo = userInfo()
  const brewBins = [
    join(uinfo.homedir, '.linuxbrew/bin/brew'),
    '/home/linuxbrew/.linuxbrew/bin/brew'
  ]
  runBrewChecks(brewBins, sendGlobalUpdate)
}

/**
 * 运行 Brew 检查
 */
const runBrewChecks = async (brewBins: string[], sendGlobalUpdate: () => void) => {
  let brewBin: string
  try {
    brewBin = (await spawnPromiseWithEnv('which', ['brew'])).stdout.trim()
    if (!isAbsolute(brewBin) || !existsSync(brewBin))
      throw new Error('Cannot find the Homebrew executable on PATH')
  } catch (error) {
    global.Server.BrewBin = brewBins.find((bin) => existsSync(bin))
    global.Server.BrewHome = undefined
    global.Server.BrewCellar = undefined
    global.Server.BrewError = String(error)
    sendGlobalUpdate()
    return
  }

  // The version list uses Homebrew on PATH. Bind its paths and mutations to that same executable.
  const [repo, cellar] = await Promise.allSettled([
    spawnPromiseWithEnv(brewBin, ['--repo'], { shell: false }),
    spawnPromiseWithEnv(brewBin, ['--cellar'], { shell: false })
  ])
  global.Server.BrewBin = brewBin
  global.Server.BrewHome = repo.status === 'fulfilled' ? repo.value.stdout.trim() : undefined
  global.Server.BrewCellar = cellar.status === 'fulfilled' ? cellar.value.stdout.trim() : undefined
  const error =
    cellar.status === 'rejected'
      ? cellar.reason
      : repo.status === 'rejected'
        ? repo.reason
        : undefined
  global.Server.BrewError = error === undefined ? undefined : String(error)
  sendGlobalUpdate()
  if (global.Server.BrewHome) {
    makeRepoSafe(global.Server.BrewHome).catch((error) =>
      console.warn('Homebrew repository setup failed:', error)
    )
  }
}

/**
 * 设置 Git 安全目录
 */
const makeRepoSafe = (dir: string) => {
  return spawnPromiseWithEnv('git', [
    'config',
    '--global',
    '--add',
    'safe.directory',
    join(dir, 'Library/Taps/homebrew/homebrew-core')
  ]).then(() => {
    return spawnPromiseWithEnv('git', [
      'config',
      '--global',
      '--add',
      'safe.directory',
      join(dir, 'Library/Taps/homebrew/homebrew-cask')
    ])
  })
}

/**
 * 检查 MacPorts
 */
const checkMacPorts = (sendGlobalUpdate: () => void) => {
  spawnPromiseWithEnv('which', ['port'])
    .then((res) => {
      global.Server.MacPorts = res.stdout
      sendGlobalUpdate()
    })
    .catch((e: Error) => {
      console.log('which port e: ', e)
    })
}

/**
 * 检查 SDKMAN
 */
const checkSdkman = (sendGlobalUpdate: () => void) => {
  const uinfo = userInfo()
  const sdkmanInit = join(uinfo.homedir, '.sdkman/bin/sdkman-init.sh')
  if (existsSync(sdkmanInit)) {
    global.Server.SdkmanHome = join(uinfo.homedir, '.sdkman')
    sendGlobalUpdate()
  }
}

/**
 * 检查 Brew 或 Port
 */
export const CheckBrewOrPort = (sendGlobalUpdate: () => void) => {
  if (isMacOS()) {
    checkMacOSBrew(sendGlobalUpdate)
    checkMacPorts(sendGlobalUpdate)
    checkSdkman(sendGlobalUpdate)
  } else if (isLinux()) {
    checkLinuxBrew(sendGlobalUpdate)
    checkSdkman(sendGlobalUpdate)
  }
}
