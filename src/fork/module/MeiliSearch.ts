import { basename, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  serviceStartExecGetPID,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  mkdirp,
  readFile,
  writeFile
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../TaskQueue'

class MeiliSearch extends Base {
  constructor() {
    super()
    this.type = 'meilisearch'
  }

  init() {
    this.pidPath = join(window.Server.BaseDir!, 'meilisearch/meilisearch.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(window.Server.BaseDir!, 'meilisearch')
      await mkdirp(baseDir)
      const iniFile = join(baseDir, 'meilisearch.toml')
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmplFile = join(window.Server.Static!, 'tmpl/meilisearch.toml')
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

  _startServer(version: SoftInstalled, lastVersion?: SoftInstalled, WORKING_DIR?: string) {
    console.log('_startServer: ', version, WORKING_DIR)
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `meilisearch-${version.version}` })
        )
      })
      const iniFile = await this.initConfig().on(on)

      const bin = version.bin
      const baseDir = join(window.Server.BaseDir!, 'meilisearch')
      const execArgs = `--config-file-path \`"${iniFile}\`"`
      const execEnv = ``
      const working_dir = WORKING_DIR ?? baseDir

      try {
        const res = await serviceStartExecGetPID(
          version,
          this.pidPath,
          baseDir,
          working_dir,
          bin,
          execArgs,
          execEnv,
          on
        )
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('meilisearch')
        all.forEach((a: any) => {
          const dir = join(window.Server.AppDir!, `meilisearch`, a.version, 'meilisearch.exe')
          const zip = join(window.Server.Cache!, `meilisearch-${a.version}.exe`)
          a.appDir = join(window.Server.AppDir!, `meilisearch`, a.version)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
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
      Promise.all([versionLocalFetch(setup?.meilisearch?.dirs ?? [], 'meilisearch.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} --version`
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
}
export default new MeiliSearch()
