import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  portSearch,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod } from 'fs-extra'
import TaskQueue from '../TaskQueue'
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
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MongoDBDir!, `mongodb-${v}.conf`)
      const dataDir = join(global.Server.MongoDBDir!, `data-${v}`)
      if (!existsSync(dataDir)) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
      }
      if (!existsSync(m)) {
        const tmpl = join(global.Server.Static!, 'tmpl/mongodb.conf')
        let conf = await readFile(tmpl, 'utf-8')
        conf = conf.replace('##DB-PATH##', dataDir)
        await writeFile(m, conf)
      }
      const logPath = join(global.Server.MongoDBDir!, `mongodb-${v}.log`)
      const params = ['--config', m, '--logpath', logPath, '--pidfilepath', this.pidPath, '--fork']
      on(I18nT('fork.command') + `: ${bin} ${params.join(' ')}`)
      spawnPromise(bin, params).on(on).then(resolve).catch(reject)
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
