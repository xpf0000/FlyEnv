import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, unlink, remove } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { execPromiseRoot, execPromiseRootWhenNeed } from '@shared/Exec'
class Manager extends Base {
  constructor() {
    super()
    this.type = 'mongodb'
  }

  init() {
    this.pidPath = join(global.Server.MongoDBDir!, 'mongodb.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MongoDBDir!, `mongodb-${v}.conf`)
      const dataDir = join(global.Server.MongoDBDir!, `data-${v}`)
      if (!existsSync(dataDir)) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
      }
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmpl = join(global.Server.Static!, 'tmpl/mongodb.conf')
        let conf = await readFile(tmpl, 'utf-8')
        conf = conf.replace('##DB-PATH##', dataDir)
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }
      const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)

      const startLog = join(global.Server.MongoDBDir!, 'start.log')
      const startErrorLog = join(global.Server.MongoDBDir!, 'start.error.log')
      if (existsSync(startErrorLog)) {
        try {
          await remove(startErrorLog)
        } catch (e) {}
      }

      const commands: string[] = ['#!/bin/zsh']
      commands.push(`cd "${dirname(bin)}"`)
      commands.push(
        `./${basename(bin)} --config "${m}" --logpath "${logPath}" --pidfilepath "${this.pidPath}" --fork > "${startLog}" 2>"${startErrorLog}" &`
      )
      commands.push(`echo $!`)
      const command = commands.join('\n')
      console.log('command: ', command)
      const sh = join(global.Server.MongoDBDir!, `start.sh`)
      await writeFile(sh, command)
      await execPromiseRoot([`chmod`, '777', sh])
      try {
        if (existsSync(this.pidPath)) {
          await unlink(this.pidPath)
        }
      } catch (e) {}

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      try {
        const res = await execPromiseRootWhenNeed(`zsh`, [sh])
        console.log('res: ', res)
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: e,
              service: `${this.type}-${version.version}`
            })
          )
        })
        reject(e)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      const res = await this.waitPidFile(this.pidPath, startErrorLog)
      if (res && res?.pid) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
        })
        resolve({
          'APP-Service-Start-PID': res.pid
        })
        return
      }
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.execStartCommandFail', {
            error: res ? res?.error : 'Start Fail',
            service: `${this.type}-${version.version}`
          })
        )
      })
      reject(new Error('Start Fail'))
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([
        versionLocalFetch(setup?.mongodb?.dirs ?? [], 'mongod', 'mongodb-'),
        versionMacportsFetch(['bin/mongod', 'sbin/mongod'])
      ])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${item.bin} --version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, command, reg)
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const cammand =
          'brew search -q --desc --eval-all --formula "High-performance, schema-free, document-oriented database"'
        all = await brewSearch(all, cammand, (content) => {
          content = content
            .replace('==> Formulae', '')
            .replace(
              new RegExp(
                ': High-performance, schema-free, document-oriented database \\(Enterprise\\)',
                'g'
              ),
              ''
            )
            .replace(
              new RegExp(': High-performance, schema-free, document-oriented database', 'g'),
              ''
            )
          return content
        })
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        `^mongodb\\d*$`,
        (f) => {
          return f.includes('high-performance, schema-free, document-oriented')
        },
        () => {
          return (
            existsSync(join('/opt/local/bin', 'mongod')) ||
            existsSync(join('/opt/local/sbin', 'mongod'))
          )
        }
      )
      resolve(Info)
    })
  }
}
export default new Manager()
