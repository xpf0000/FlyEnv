import { isArmArch, isLinux, isMacOS } from '@shared/utils'
import { userInfo } from 'node:os'
import { join } from 'node:path'
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
const runBrewChecks = (brewBins: string[], sendGlobalUpdate: () => void) => {
  const handleBrewCheck = (error?: Error) => {
    for (const s of brewBins) {
      if (existsSync(s)) {
        global.Server.BrewBin = s
        break
      }
    }
    if (error) {
      global.Server.BrewError = error.toString()
    }
    sendGlobalUpdate()
  }

  executeBrewChecks(handleBrewCheck)
}

/**
 * 执行 Brew 检查命令
 */
const executeBrewChecks = (handleBrewCheck: (error?: Error) => void) => {
  spawnPromiseWithEnv('which', ['brew'])
    .then((res) => {
      console.log('which brew: ', res)
      checkBrewRepo(handleBrewCheck)
      checkBrewCellar(handleBrewCheck)
    })
    .catch((e: Error) => {
      handleBrewCheck(e)
      console.log('which brew e: ', e)
    })
}

/**
 * 检查 Brew 仓库
 */
const checkBrewRepo = (handleBrewCheck: (error?: Error) => void) => {
  spawnPromiseWithEnv('brew', ['--repo'])
    .then((res) => {
      console.log('brew --repo: ', res)
      const dir = res.stdout
      global.Server.BrewHome = dir
      handleBrewCheck()
      makeRepoSafe(dir)
    })
    .catch((e: Error) => {
      handleBrewCheck(e)
      console.log('brew --repo err: ', e)
    })
}

/**
 * 检查 Brew Cellar
 */
const checkBrewCellar = (handleBrewCheck: (error?: Error) => void) => {
  spawnPromiseWithEnv('brew', ['--cellar'])
    .then((res) => {
      const dir = res.stdout
      console.log('brew --cellar: ', res)
      global.Server.BrewCellar = dir
      handleBrewCheck()
    })
    .catch((e: Error) => {
      handleBrewCheck(e)
      console.log('brew --cellar err: ', e)
    })
}

/**
 * 设置 Git 安全目录
 */
const makeRepoSafe = (dir: string) => {
  spawnPromiseWithEnv('git', [
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
