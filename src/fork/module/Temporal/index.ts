import { basename, dirname, join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  binXattrFix,
  chmod,
  mkdirp,
  moveChildDirToParent,
  readFile,
  remove,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort,
  waitTime,
  writeFile,
  zipUnpack
} from '../../Fn'
import { unpack } from '../../util/Zip'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/runtime'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'
import { ProcessKill, ProcessOwnedPidsByPid, ProcessSearch } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { buildServerYaml, buildUiYaml, serverEnvName } from './util'

class Temporal extends Base {
  uiPidPath = ''

  constructor() {
    super()
    this.type = 'temporal'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'temporal/temporal.pid')
    this.uiPidPath = join(global.Server.BaseDir!, 'temporal/temporal-ui.pid')
  }

  uiBin(): string {
    return join(global.Server.AppDir!, 'temporal-ui', isWindows() ? 'ui-server.exe' : 'ui-server')
  }

  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'temporal')
      const configDir = join(baseDir, 'config')
      const env = serverEnvName(version?.version ?? 'unknown')
      const confFile = join(configDir, `${env}.yaml`)
      if (!existsSync(confFile)) {
        try {
          await mkdirp(configDir)
          await mkdirp(join(baseDir, 'data'))
          on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInit')) })
          const content = buildServerYaml(join(baseDir, 'data'))
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

  initUiConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const configDir = join(global.Server.BaseDir!, 'temporal', 'config')
      const confFile = join(configDir, 'temporal-ui.yaml')
      if (!existsSync(confFile)) {
        try {
          await mkdirp(configDir)
          const content = buildUiYaml()
          await writeFile(confFile, content)
          await writeFile(`${confFile}.default`, content)
        } catch (e) {
          reject(e)
          return
        }
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled, uiFlag?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `temporal-${version.version}` })
        )
      })
      const baseDir = join(global.Server.BaseDir!, 'temporal')
      const configDir = join(baseDir, 'config')
      await this.initConfig(version).on(on)
      const env = serverEnvName(version?.version ?? '')
      const execArgs = ['-r', '/', '-c', configDir, '-e', env, 'start']
      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin: version.bin,
          execArgs,
          on
        })
        if (uiFlag === '1') {
          try {
            await this._startUiServer(version, on)
          } catch (e) {
            console.log('temporal ui-server start err: ', e)
            on({ 'APP-On-Log': AppLog('info', `Temporal UI (ui-server) start failed: ${e}`) })
          }
        }
        this._bootstrapNamespace(on).catch((e) => {
          console.log('temporal namespace bootstrap err: ', e)
        })
        resolve(res)
      } catch (e: any) {
        console.log('temporal start err: ', e)
        reject(e)
      }
    })
  }

  private async _startUiServer(version: SoftInstalled, on: any): Promise<void> {
    const bin = this.uiBin()
    if (!existsSync(bin)) {
      on({
        'APP-On-Log': AppLog(
          'info',
          'Temporal UI (ui-server) is not installed. Install it from the Web UI section on the Service tab.'
        )
      })
      return
    }
    const baseDir = join(global.Server.BaseDir!, 'temporal')
    const configDir = join(baseDir, 'config')
    await this.initUiConfig().on(on)
    const uiVersion: any = { ...version, typeFlag: 'temporal' }
    await serviceStartSpawn({
      version: uiVersion,
      pidPath: this.uiPidPath,
      baseDir,
      bin,
      execArgs: ['-r', '/', '-c', configDir, '-e', 'temporal-ui', 'start'],
      outFile: join(baseDir, 'temporal-ui-start-out.log'),
      errFile: join(baseDir, 'temporal-ui-start-error.log'),
      on
    })
  }

  private async _bootstrapNamespace(on: any): Promise<void> {
    const cliRoot = join(global.Server.AppDir!, 'temporal-cli')
    if (!existsSync(cliRoot)) {
      return
    }
    const exe = isWindows() ? 'temporal.exe' : 'temporal'
    const bin = readdirSync(cliRoot)
      .sort()
      .reverse()
      .map((d) => join(cliRoot, d, exe))
      .find((p) => existsSync(p))
    if (!bin) {
      return
    }
    for (let i = 0; i < 3; i++) {
      try {
        await waitTime(3000)
        await spawnPromise(basename(bin), ['operator', 'namespace', 'create', '--namespace', 'default', '--address', '127.0.0.1:7233'], {
          shell: false,
          cwd: dirname(bin)
        })
        on({
          'APP-On-Log': AppLog('info', 'Temporal default namespace is ready')
        })
        return
      } catch (e) {
        console.log(`temporal namespace create attempt ${i + 1} err: `, e)
      }
    }
    on({
      'APP-On-Log': AppLog(
        'info',
        'Temporal default namespace was not created automatically. Run: temporal operator namespace create --namespace default'
      )
    })
  }

  _stopServer(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        await this._stopUiServer(version)
      } catch (e) {
        console.log('temporal stop ui-server err: ', e)
      }
      try {
        const res = await super._stopServer(version, ...args).on(on)
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  private async _stopUiServer(version: SoftInstalled): Promise<void> {
    const plist = await StopProcessListFetch()
    const ownedMarkers = this.ownedProcessMarkers(version)
    const allPid: string[] = []
    if (existsSync(this.uiPidPath)) {
      try {
        const content = await readFile(this.uiPidPath, 'utf-8')
        const pid = content.trim()
        if (pid) {
          allPid.push(...ProcessOwnedPidsByPid(pid, plist, ownedMarkers))
        }
      } catch {}
    }
    const searched = ProcessSearch('ui-server', false, plist)
      .filter((p) => {
        if (isWindows()) {
          return p.COMMAND.includes('FlyEnv-Data') || p.COMMAND.includes('PhpWebStudy-Data')
        }
        return (
          (p.COMMAND.includes(global.Server.BaseDir!) ||
            p.COMMAND.includes(global.Server.AppDir!)) &&
          !p.COMMAND.includes(' grep ')
        )
      })
      .map((p) => `${p.PID}`)
    allPid.push(...searched)
    const arr = Array.from(new Set(allPid))
    if (arr.length > 0) {
      try {
        await ProcessKill('-INT', arr)
      } catch {}
    }
    try {
      if (existsSync(this.uiPidPath)) {
        await remove(this.uiPidPath)
      }
    } catch {}
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('temporal')
        all.forEach((a: any) => {
          const exe = isWindows() ? 'temporal-server.exe' : 'temporal-server'
          const ext = isWindows() ? '.zip' : '.tar.gz'
          a.appDir = join(global.Server.AppDir!, 'temporal', a.version)
          a.bin = join(a.appDir, exe)
          a.zip = join(global.Server.Cache!, `temporal-${a.version}${ext}`)
          a.downloaded = existsSync(a.zip)
          a.installed = existsSync(a.bin)
          a.name = `Temporal-${a.version}`
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
        all = [versionLocalFetch(setup?.temporal?.dirs ?? [], 'temporal-server.exe')]
      } else {
        all = [versionLocalFetch(setup?.temporal?.dirs ?? [], 'temporal-server', 'temporal')]
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
    const isUi = basename(row.bin).startsWith('ui-server')
    if (isUi) {
      await remove(row.appDir)
    }
    await mkdirp(row.appDir)
    if (`${row.zip}`.endsWith('.zip')) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      await unpack(row.zip, row.appDir)
    }
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
    if (isUi) {
      await writeFile(join(row.appDir, 'version.txt'), `${row.version ?? ''}`)
      try {
        await spawnPromise(basename(row.bin), ['--version'], {
          shell: false,
          cwd: dirname(row.bin)
        })
      } catch (e) {
        console.log('ui-server --version check failed (ignored): ', e)
      }
      return
    }
    await spawnPromise(basename(row.bin), ['--version'], {
      shell: false,
      cwd: dirname(row.bin)
    })
  }

  fetchUiLatest() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('temporal-ui')
        const first: any = all?.[0]
        if (!first) {
          resolve(null)
          return
        }
        const appDir = join(global.Server.AppDir!, 'temporal-ui')
        const bin = this.uiBin()
        first.appDir = appDir
        first.bin = bin
        first.zip = join(global.Server.Cache!, `temporal-ui-${first.version}.tar.gz`)
        first.downloaded = existsSync(first.zip)
        first.installed = existsSync(bin)
        first.name = `Temporal-UI-${first.version}`
        resolve(first)
      } catch {
        resolve(null)
      }
    })
  }

  installUiLatest(row: any) {
    return this.installSoft(row)
  }

  uiServerInfo() {
    return new ForkPromise(async (resolve) => {
      const bin = this.uiBin()
      const info: { installed: boolean; version: string | null } = {
        installed: existsSync(bin),
        version: null
      }
      const versionFile = join(global.Server.AppDir!, 'temporal-ui', 'version.txt')
      if (info.installed && existsSync(versionFile)) {
        try {
          info.version = (await readFile(versionFile, 'utf-8')).trim()
        } catch {}
      }
      resolve(info)
    })
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const configDir = join(global.Server.BaseDir!, 'temporal', 'config')
    const env = serverEnvName(version.version)
    return [
      { name: 'config', path: join(configDir, `${env}.yaml`) },
      { name: 'default', path: join(configDir, `${env}.yaml.default`) },
      { name: 'ui', path: join(configDir, 'temporal-ui.yaml') },
      { name: 'ui-default', path: join(configDir, 'temporal-ui.yaml.default') }
    ].filter((f) => existsSync(f.path))
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'temporal')
    const v = version.version.trim().split(' ').join('')
    return [
      { name: 'start-out', path: join(baseDir, `temporal-${v}-start-out.log`) },
      { name: 'start-error', path: join(baseDir, `temporal-${v}-start-error.log`) },
      { name: 'ui-start-out', path: join(baseDir, 'temporal-ui-start-out.log') },
      { name: 'ui-start-error', path: join(baseDir, 'temporal-ui-start-error.log') }
    ]
  }
}
export default new Temporal()
