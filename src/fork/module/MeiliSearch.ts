import { join } from 'path'
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
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, readFile, remove, writeFile } from 'fs-extra'
import { I18nT } from '@lang/index'
import TaskQueue from '../TaskQueue'

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

      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'meilisearch')
      const execArgs = `--config-file-path "${iniFile}"`
      const pidPath = this.pidPath

      if (pidPath && existsSync(pidPath)) {
        try {
          await remove(pidPath)
        } catch (e) {}
      }
      await mkdirp(baseDir)
      const outFile = join(baseDir, `start.${version.version}.out.log`)
      const errFile = join(baseDir, `start.${version.version}.error.log`)

      const working_dir = WORKING_DIR ?? baseDir

      const psScript = `#!/bin/zsh
cd "${working_dir}"
nohup "${bin}" ${execArgs} > "${outFile}" 2>"${errFile}" &
echo "##FlyEnv-Process-ID$!FlyEnv-Process-ID##"`

      const psName = `start-${version.version!.trim()}.sh`.split(' ').join('')
      const psPath = join(baseDir, psName)
      await writeFile(psPath, psScript)

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })

      process.chdir(baseDir)
      let res: any
      try {
        res = await spawnPromise('zsh', [psName], {
          cwd: baseDir
        })
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.startServiceFail', {
              error: `${e.toString()}`,
              service: `${version.typeFlag}-${version.version}`
            })
          )
        })
        return reject(e)
      }

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })

      let pid = ''
      const stdout = res.trim()
      const regex = /FlyEnv-Process-ID(.*?)FlyEnv-Process-ID/g
      const match = regex.exec(stdout)
      if (match) {
        pid = match[1]
      }
      await writeFile(pidPath, pid)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
      })
      return resolve({
        'APP-Service-Start-PID': pid
      })
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('meilisearch')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `meilisearch-${a.version}`, 'meilisearch')
          const zip = join(global.Server.Cache!, `meilisearch-${a.version}`)
          a.appDir = join(global.Server.AppDir!, `meilisearch-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`meilisearch-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.meilisearch?.dirs ?? [], 'meilisearch', 'meilisearch')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) =>
            TaskQueue.run(
              versionBinVersion,
              `${item.bin} --version`,
              /(meilisearch )(\d+(\.\d+){1,4})(.*?)/g
            )
          )
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
