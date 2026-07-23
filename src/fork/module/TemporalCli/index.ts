import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  binXattrFix,
  chmod,
  mkdirp,
  moveChildDirToParent,
  readFile,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort,
  writeFile
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/runtime'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'
import { buildDefaultConf, parseConfToArgs } from './util'

class TemporalCli extends Base {
  constructor() {
    super()
    this.type = 'temporal-cli'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'temporal-cli/temporal-cli.pid')
  }

  confFile(version: SoftInstalled): string {
    const v = version?.version ?? 'unknown'
    return join(global.Server.BaseDir!, 'temporal-cli', `temporal-cli-v${v}.conf`)
  }

  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'temporal-cli')
      const dataDir = join(baseDir, 'data')
      const confFile = this.confFile(version)
      if (!existsSync(confFile)) {
        try {
          await mkdirp(baseDir)
          await mkdirp(dataDir)
          on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInit')) })
          const content = buildDefaultConf(join(dataDir, 'dev.db'))
          await writeFile(confFile, content)
          await writeFile(`${confFile}.default`, content)
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: confFile }))
          })
        } catch (e) {
          reject(e)
          return
        }
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `temporal-cli-${version.version}` })
        )
      })
      const confFile = await this.initConfig(version).on(on)
      const baseDir = join(global.Server.BaseDir!, 'temporal-cli')
      const content = await readFile(confFile, 'utf-8')
      const execArgs = ['server', 'start-dev', ...parseConfToArgs(content)]
      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin: version.bin,
          execArgs,
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('temporal-cli start err: ', e)
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('temporal-cli')
        all.forEach((a: any) => {
          const exe = isWindows() ? 'temporal.exe' : 'temporal'
          const ext = isWindows() ? '.zip' : '.tar.gz'
          a.appDir = join(global.Server.AppDir!, 'temporal-cli', a.version)
          a.bin = join(a.appDir, exe)
          a.zip = join(global.Server.Cache!, `temporal-cli-${a.version}${ext}`)
          a.downloaded = existsSync(a.zip)
          a.installed = existsSync(a.bin)
          a.name = `Temporal-CLI-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.['temporal-cli']?.dirs ?? [], 'temporal.exe')]
      } else {
        all = [versionLocalFetch(setup?.['temporal-cli']?.dirs ?? [], 'temporal', 'temporal')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(version )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            Object.assign(versions[i], {
              version: version,
              num: 0,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await super._installSoftHandle(row)
    if (!existsSync(row.bin)) {
      try {
        await moveChildDirToParent(row.appDir)
      } catch {}
    }
    if (!isWindows()) {
      await chmod(row.bin, '0755')
      if (isMacOS()) {
        try {
          await binXattrFix(row.bin)
        } catch {}
      }
    }
    await spawnPromise(basename(row.bin), ['--version'], {
      shell: false,
      cwd: dirname(row.bin)
    })
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const confFile = this.confFile(version)
    return [
      { name: 'config', path: confFile },
      { name: 'default', path: `${confFile}.default` }
    ]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'temporal-cli')
    const v = version.version.trim().split(' ').join('')
    return [
      { name: 'start-out', path: join(baseDir, `temporal-cli-${v}-start-out.log`) },
      { name: 'start-error', path: join(baseDir, `temporal-cli-${v}-start-error.log`) }
    ]
  }
}
export default new TemporalCli()
