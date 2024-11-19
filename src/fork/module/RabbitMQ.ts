import { dirname, join } from 'path'
import { existsSync, readdirSync, realpathSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  brewInfoJson,
  brewSearch,
  portSearch,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, unlink } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { execPromiseRoot } from '@shared/Exec'
class RabbitMQ extends Base {
  baseDir: string = ''

  constructor() {
    super()
    this.type = 'rabbitmq'
  }

  init() {
    this.baseDir = join(global.Server.BaseDir!, 'rabbitmq')
    this.pidPath = join(this.baseDir, 'rabbitmq.pid')
  }

  initConfig(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      this._initConf(version).then(resolve)
    })
  }
  _initConf(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const v = version?.version?.split('.')?.[0] ?? ''
      const confFile = join(this.baseDir, `rabbitmq-${v}.conf`)
      const logDir = join(this.baseDir, `log-${v}`)
      await mkdirp(logDir)
      if (!existsSync(confFile)) {
        const pluginsDir = join(version.path, 'plugins')
        const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
        const content = `NODE_IP_ADDRESS=127.0.0.1
NODENAME=rabbit@localhost
RABBITMQ_LOG_BASE=${logDir}
MNESIA_BASE=${mnesiaBaseDir}
PLUGINS_DIR="${pluginsDir}"`
        await writeFile(confFile, content)
        const defaultFile = join(this.baseDir, `rabbitmq-${v}-default.conf`)
        await writeFile(defaultFile, content)
      }
      resolve(confFile)
    })
  }

  async _initPlugin(version: SoftInstalled) {
    try {
      const res = await execPromiseRoot(`./rabbitmq-plugins enable rabbitmq_management`, {
        cwd: dirname(version.bin)
      })
      console.log('_initPlugin res: ', res)
    } catch (e: any) {
      console.log('_initPlugin err: ', e)
    }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this._initPlugin(version)
      const confFile = await this._initConf(version)
      const v = version?.version?.split('.')?.[0] ?? ''
      const mnesiaBaseDir = join(this.baseDir, `mnesia-${v}`)
      await mkdirp(mnesiaBaseDir)
      const checkpid = async (time = 0) => {
        const all = readdirSync(mnesiaBaseDir)
        if (all.some((p) => p.endsWith('.pid'))) {
          resolve(0)
        } else {
          if (time < 20) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }
      try {
        const all = readdirSync(mnesiaBaseDir)
        const pid = all.find((p) => p.endsWith('.pid'))
        if (pid) {
          await unlink(join(mnesiaBaseDir, pid))
        }
      } catch (e) {}
      try {
        await spawnPromise(version.bin, ['-detached', `--PWSAPPFLAG=${global.Server.BaseDir!}`], {
          env: {
            RABBITMQ_CONF_ENV_FILE: confFile
          }
        }).on(on)
        await checkpid()
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('rabbitmq')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `static-rabbitmq-${a.version}`,
            'sbin/rabbitmq-server'
          )
          const zip = join(global.Server.Cache!, `static-rabbitmq-${a.version}.tar.xz`)
          a.appDir = join(global.Server.AppDir!, `static-rabbitmq-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`rabbitmq-${a.version}`] = a
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
      Promise.all([versionLocalFetch(setup?.rabbitmq?.dirs ?? [], 'rabbitmq-server', 'rabbitmq')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          if (existsSync('/opt/local/lib/rabbitmq/bin/rabbitmq-server')) {
            const bin = realpathSync('/opt/local/lib/rabbitmq/bin/rabbitmq-server')
            versions.push({
              bin: bin,
              path: dirname(dirname(bin)),
              run: false,
              running: false
            } as any)
          }

          versions = versions.filter((v) => existsSync(join(v.path, 'plugins')))

          const all = versions.map((item) => {
            const command = `${join(dirname(item.bin), 'rabbitmqctl')} version`
            const reg = /(.*?)(\d+(\.\d+){1,4})(.*?)/g
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
        let all: Array<string> = ['rabbitmq']
        const cammand = 'brew search -q --formula "/^rabbitmq$/"'
        all = await brewSearch(all, cammand)
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
        `^rabbitmq-server\\d*$`,
        (f) => {
          return f.includes('The RabbitMQ AMQP Server')
        },
        () => {
          return existsSync('/opt/local/sbin/rabbitmq-server')
        }
      )
      resolve(Info)
    })
  }
}
export default new RabbitMQ()
