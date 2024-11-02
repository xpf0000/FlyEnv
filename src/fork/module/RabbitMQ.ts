import { basename, dirname, join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromiseRoot,
  uuid,
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
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
      const commands: string[] = [
        `set RABBITMQ_CONF_ENV_FILE=${confFile}`,
        `cd /d "${dirname(version.bin)}"`,
        `./${basename(version.bin)} -detached --PWSAPPFLAG=${global.Server.BaseDir!}`
      ]
      const sh = join(global.Server.Cache!, `${uuid()}.cmd`)
      await writeFile(sh, commands.join('\n'))
      process.chdir(global.Server.Cache!)
      try {
        await execPromiseRoot(`start /B ./${basename(sh)} > null 2>&1 &`)
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
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `rabbitmq-${a.version}`,
            'sbin/rabbitmq-server.bat'
          )
          const zip = join(global.Server.Cache!, `rabbitmq-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `rabbitmq-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.rabbitmq?.dirs ?? [], 'rabbitmq-server.bat')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
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
}
export default new RabbitMQ()
