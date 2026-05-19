import { join } from 'path'
import { existsSync } from 'fs'

import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  execPromiseWithEnv,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  readdir,
  serviceStartExecCMD,
  binXattrFix
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { serviceStartSpawn } from '../../util/ServiceStart'

class Numa extends Base {
  constructor() {
    super()
    this.type = 'numa'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'numa/numa.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, _reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'numa')
      await mkdirp(baseDir)
      const configFile = join(baseDir, 'numa.toml')
      if (!existsSync(configFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const isZh = global.Server.Lang === 'zh'
        const tmplFile = join(global.Server.Static!, isZh ? 'tmpl/numa.zh.toml' : 'tmpl/numa.toml')
        let content = await readFile(tmplFile, 'utf-8')
        content = content.replace(/#FLYENV_DATA_DIR#/g, join(baseDir, 'data').replace(/\\/g, '/'))
        await writeFile(configFile, content)
        const defaultConfigFile = join(baseDir, 'numa.default.toml')
        await writeFile(defaultConfigFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: configFile }))
        })
      }
      resolve(configFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `numa-${version.version}` })
        )
      })
      const configFile = await this.initConfig().on(on)
      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'numa')
      await mkdirp(baseDir)

      const execArgs = `"${configFile}"`
      try {
        let res: any
        if (isLinux()) {
          res = await serviceStartExec({
            root: true,
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            on,
            checkPidFile: false
          })
        } else if (isMacOS()) {
          res = await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs: [configFile],
            waitTime: 500,
            on
          })
        } else {
          res = await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            on,
            checkPidFile: false
          })
        }
        resolve(res)
      } catch (e: any) {
        console.log('numa start err: ', e)
        reject(e)
        return
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('numa')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, 'numa', a.version, 'numa.exe')
            zip = join(global.Server.Cache!, `numa-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, 'numa', a.version)
          } else {
            dir = join(global.Server.AppDir!, 'numa', a.version, 'numa')
            zip = join(global.Server.Cache!, `numa-${a.version}.tgz`)
            a.appDir = join(global.Server.AppDir!, 'numa', a.version)
          }

          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Numa-${a.version}`
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
      if (isWindows()) {
        all = [versionLocalFetch(setup?.numa?.dirs ?? [], 'numa.exe')]
      } else {
        all = [versionLocalFetch(setup?.numa?.dirs ?? [], 'numa', 'numa')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(numa )(\d+(\.\d+){1,4})/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version ? Number(version.split('.').slice(0, 2).join('')) : null
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

  getLogFiles() {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'numa')
      const files: Array<{ name: string; path: string }> = []
      try {
        if (existsSync(baseDir)) {
          const list = await readdir(baseDir)
          list.forEach((name) => {
            if (name.startsWith('numa-') && name.endsWith('.log')) {
              files.push({
                name: name.replace('.log', ''),
                path: join(baseDir, name)
              })
            }
          })
        }
      } catch (e) {
        console.log('numa getLogFiles error: ', e)
      }
      resolve(files)
    })
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const allTap = await execPromiseWithEnv('brew tap')
        if (!allTap.stdout.includes('razvandimescu/tap')) {
          await execPromiseWithEnv('brew tap razvandimescu/tap')
        }
        const all = ['numa']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await super._installSoftHandle(row)
    if (isMacOS()) {
      await binXattrFix(row.bin)
    }
  }
}

export default new Numa()
