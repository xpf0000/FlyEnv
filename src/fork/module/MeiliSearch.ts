import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  mkdirp,
  readFile,
  remove,
  writeFile,
  serviceStartExec,
  copyFile,
  chmod,
  waitTime,
  execPromise,
  serviceStartExecWin
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../TaskQueue'
import { appDebugLog, isMacOS, isWindows } from '@shared/utils'

class MeiliSearch extends Base {
  constructor() {
    super()
    this.type = 'meilisearch'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'meilisearch/meilisearch.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'meilisearch')
      await mkdirp(baseDir)
      const iniFile = join(baseDir, 'meilisearch.toml')
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmplFile = join(global.Server.Static!, 'tmpl/meilisearch.toml')
        const content = await readFile(tmplFile, 'utf-8')
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'meilisearch.default.toml')
        await writeFile(defaultIniFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      resolve(iniFile)
    })
  }

  _startServer(version: SoftInstalled, WORKING_DIR?: string) {
    console.log('_startServer: ', version, WORKING_DIR)
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `meilisearch-${version.version}` })
        )
      })
      const iniFile = await this.initConfig().on(on)

      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const bin = version.bin
      const working_dir_default = join(global.Server.BaseDir!, 'meilisearch', v)
      await mkdirp(working_dir_default)

      const working_dir = WORKING_DIR ?? working_dir_default

      const baseDir = join(global.Server.BaseDir!, 'meilisearch')

      if (isMacOS()) {
        const execArgs = `--config-file-path "${iniFile}"`
        try {
          const res = await serviceStartExec({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            on,
            timeToWait: 1000,
            checkPidFile: false,
            cwd: working_dir
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else if (isWindows()) {
        const execArgs = `--config-file-path \`"${iniFile}\`"`
        const execEnv = ``

        try {
          const res = await serviceStartExecWin({
            version,
            pidPath: this.pidPath,
            baseDir,
            cwd: working_dir,
            bin,
            execArgs,
            execEnv,
            on,
            checkPidFile: false
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('meilisearch')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isMacOS()) {
            dir = join(global.Server.AppDir!, `meilisearch-${a.version}`, 'meilisearch')
            zip = join(global.Server.Cache!, `meilisearch-${a.version}`)
            a.appDir = join(global.Server.AppDir!, `meilisearch-${a.version}`)
          } else if (isWindows()) {
            dir = join(global.Server.AppDir!, `meilisearch`, a.version, 'meilisearch.exe')
            zip = join(global.Server.Cache!, `meilisearch-${a.version}.exe`)
            a.appDir = join(global.Server.AppDir!, `meilisearch`, a.version)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `MeiliSearch-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isMacOS()) {
        all = [versionLocalFetch(setup?.meilisearch?.dirs ?? [], 'meilisearch', 'meilisearch')]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.meilisearch?.dirs ?? [], 'meilisearch.exe')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(meilisearch )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
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
    if (isMacOS()) {
      const command = `cd "${dirname(row.bin)}" && ./${basename(row.bin)} --version`
      console.log('command: ', command)
      await mkdirp(dirname(row.bin))
      await copyFile(row.zip, row.bin)
      await chmod(row.bin, '0777')
      await waitTime(500)
      await execPromise(command)
    } else if (isWindows()) {
      await waitTime(500)
      await mkdirp(dirname(row.bin))
      try {
        await copyFile(row.zip, row.bin)
        await waitTime(500)
        await spawnPromise(basename(row.bin), ['--version'], {
          shell: false,
          cwd: dirname(row.bin)
        })
      } catch (e: any) {
        if (existsSync(row.bin)) {
          await remove(row.bin)
        }
        await appDebugLog('[handleMeilisearch][error]', e.toString())
        throw e
      }
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['meilisearch']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }
}
export default new MeiliSearch()
