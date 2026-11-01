import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import {
  AppLog,
  brewInfoJson,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  remove,
  waitTime,
  zipUnpack,
  moveChildDirToParent,
  spawnPromiseWithEnv
} from '../../Fn'
import {
  prepareUnixLogDirectory,
  serviceStartSpawn,
  type ServiceStartSpawnParams
} from '../../util/ServiceStart'
import { ProcessListFetch, ProcessOwnedPidsByPid } from '@shared/Process'
import TaskQueue from '../../TaskQueue'
import { fetchHostList } from '../Host/HostFile'
import { I18nT } from '@lang/runtime'
import { isLinux, isWindows } from '@shared/utils'
import { userInfo } from 'node:os'
import { portsFromListenConfig } from '../../util/ListenPorts'

class Nginx extends Base {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
  }

  getConfigFiles() {
    return [{ name: 'main', path: join(global.Server.NginxDir!, 'common/conf/nginx.conf') }]
  }

  getLogFiles() {
    const dir = join(global.Server.NginxDir!, 'common/logs')
    return [
      { name: 'error', path: join(dir, 'error.log') },
      { name: 'access', path: join(dir, 'access.log') }
    ]
  }

  async #handlePhpEnableConf() {
    let host: AppHost[] = []
    try {
      host = await fetchHostList()
    } catch {}
    host = host.filter((h) => !h.type || h.type === 'php')
    const all = new Set(host.map((h: any) => h.phpVersion).filter((h: number | undefined) => !!h))
    const tmplFile = join(global.Server.Static!, 'tmpl/enable-php.conf')
    let tmplContent = ''
    for (const v of all) {
      const name = `enable-php-${v}.conf`
      let confFile = ''
      if (isWindows()) {
        confFile = join(global.Server.NginxDir!, 'conf', name)
      } else {
        confFile = join(global.Server.NginxDir!, 'common/conf/', name)
      }
      if (!existsSync(confFile)) {
        await mkdirp(dirname(confFile))
        if (!tmplContent) {
          tmplContent = await readFile(tmplFile, 'utf-8')
        }
        const content = tmplContent.replace('##VERSION##', `${v}`)
        await writeFile(confFile, content)
      }
    }
  }

  async _fixConf() {
    return new ForkPromise(async (resolve) => {
      const c = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
      if (!existsSync(c)) {
        return resolve(true)
      }
      let content = await readFile(c, 'utf-8')
      const uinfo = userInfo()
      const regex = new RegExp(`([#;\\s]*?)user([\\s]+)(.*?);(.*?)([^\\n])*(\\n|$)`, 'gm')
      if (regex.test(content)) {
        content = content.replace(regex, ``)
      }
      content = `user ${uinfo.username};\n` + content
      const add: string[] = [
        'client_body_temp',
        'proxy_temp',
        'fastcgi_temp',
        'uwsgi_temp',
        'scgi_temp'
      ]
        .filter((s) => {
          const regex = new RegExp(`^[\\s\\n]?((?!#)([\\s]*?))${s}_path\\s+(.*?);`, 'gm')
          return !regex.test(content)
        })
        .map((s) => `    ${s}_path run/${s};`)

      if (add.length === 0) {
        return resolve(true)
      }

      content = content.replace(/http(.*?)\{(.*?)\n/g, `http {\n${add.join('\n')}\n`)
      await writeFile(c, content)
      resolve(true)
    })
  }

  #initConfig() {
    return new ForkPromise((resolve, reject, on) => {
      const conf = join(global.Server.NginxDir!, 'conf/nginx.conf')
      if (!existsSync(conf)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        zipUnpack(join(global.Server.Static!, 'zip/nginx.zip'), global.Server.NginxDir!)
          .then(() => {
            return readFile(conf, 'utf-8')
          })
          .then((content: string) => {
            content = content
              .replace(/#PREFIX#/g, global.Server.NginxDir!.split('\\').join('/'))
              .replace(
                '#VHostPath#',
                join(global.Server.BaseDir!, 'vhost/nginx').split('\\').join('/')
              )
            const defaultConf = join(global.Server.NginxDir!, 'conf/nginx.conf.default')
            return Promise.all([writeFile(conf, content), writeFile(defaultConf, content)])
          })
          .then(() => {
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: conf }))
            })
            resolve(true)
          })
          .catch((err: any) => {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.confInitFail', { error: err }))
            })
            console.log('initConfig err: ', err)
            resolve(true)
          })
        return
      }
      resolve(true)
    })
  }

  /**
   * serviceStartSpawn 只保证进程 2 秒内未退出；bind 失败时 nginx 会重试约 2.5 秒后才
   * 退出，恰好在判定窗口之后。这里在 spawn 成功后按进程归属核验：500ms 轮询一次，
   * 共 10 次；任一轮确认进程存活且归属本次启动的 bin 即判成功，发现进程消失或
   * PID 易主则立即判启动失败。
   */
  async #spawnAndVerify(param: ServiceStartSpawnParams): Promise<{ 'APP-Service-Start-PID': string }> {
    const version = param.version
    const errFile =
      param.errFile ??
      join(
        param.baseDir,
        `${version.typeFlag}-${version.version!.trim()}-start-error.log`.split(' ').join('')
      )
    let errBefore = 0
    try {
      errBefore = existsSync(errFile) ? (await readFile(errFile, 'utf8')).length : 0
    } catch {}
    const res = await serviceStartSpawn(param)
    const pid = res['APP-Service-Start-PID']
    for (let i = 0; i < 10; i++) {
      await waitTime(500)
      let owned: string[] = []
      try {
        owned = ProcessOwnedPidsByPid(pid, await ProcessListFetch(), [param.bin])
      } catch {
        // 进程表读取失败无法据此判定进程状态；跳过本次轮询，不误判失败
        continue
      }
      if (owned.length > 0) {
        return res
      }
      // 进程已退出或 PID 易主；只清理本次启动登记的 PID 文件，不触碰任何现存进程
      try {
        if (param.pidPath) {
          await remove(param.pidPath)
        }
      } catch {}
      let msg = ''
      try {
        if (existsSync(errFile)) {
          msg = (await readFile(errFile, 'utf8')).slice(errBefore).trim()
        }
      } catch {}
      if (!msg) {
        msg = I18nT('fork.startFail')
      }
      param.on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.startServiceFail', {
            error: msg,
            service: `${version.typeFlag}-${version.version}`
          })
        )
      })
      throw new Error(msg)
    }
    // 10 轮均未取到有效进程表，进程状态未知；维持 spawn 2 秒窗口的原有判定
    return res
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `nginx-${version.version}` })
        )
      })
      if (isWindows()) {
        await this.#initConfig().on(on)
      }
      await this.#handlePhpEnableConf()
      console.log('_startServer: ', version)
      const bin = version.bin
      const baseDir = global.Server.NginxDir!

      if (isWindows()) {
        const bin = version.bin
        const p = global.Server.NginxDir!

        const pid = join(global.Server.NginxDir!, 'logs/nginx.pid')

        const execArgs = ['-p', p]

        try {
          const res = await this.#spawnAndVerify({
            version,
            pidPath: pid,
            baseDir,
            bin,
            execArgs,
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else {
        const c = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
        const pid = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
        const errlog = join(global.Server.NginxDir!, 'common/logs/error.log')
        const temp_path = join(global.Server.NginxDir!, 'common/run')
        await mkdirp(temp_path)
        await this._fixConf()
        const p = join(global.Server.NginxDir!, 'common')
        await prepareUnixLogDirectory(join(p, 'logs'))
        await prepareUnixLogDirectory(
          join(global.Server.BaseDir!, 'vhost/logs'),
          (name) =>
            name.endsWith('.log') &&
            !name.endsWith('.caddy.log') &&
            !name.endsWith('.frankenphp.log')
        )

        {
          // `daemon off;` keeps nginx in the foreground so serviceStartSpawn's
          // detached spawn owns the master process directly (no fork-and-exit).
          const g = `pid ${pid};error_log ${errlog};daemon off;`
          const execArgs = ['-p', p, '-e', errlog, '-c', c, '-g', g]
          let listenPorts: number[] = []
          if (isLinux()) {
            try {
              const config = await spawnPromiseWithEnv(
                bin,
                ['-T', '-p', p, '-e', errlog, '-c', c],
                { timeout: 5000 }
              )
              listenPorts = portsFromListenConfig(config.stdout)
            } catch {
              // Native configuration expansion may fail; actual startup owns the error result.
            }
          }
          try {
            const res = await this.#spawnAndVerify({
              lowPortService: isLinux(),
              listenPorts,
              version,
              pidPath: pid,
              baseDir,
              bin,
              execArgs,
              on
            })
            resolve(res)
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        }
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('nginx')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(
              global.Server.AppDir!,
              `nginx-${a.version}`,
              `nginx-${a.version}`,
              'nginx.exe'
            )
            zip = join(global.Server.Cache!, `nginx-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `nginx-${a.version}`)
          } else {
            dir = join(global.Server.AppDir!, `nginx-${a.version}`, 'sbin/nginx')
            zip = join(global.Server.Cache!, `static-nginx-${a.version}.tar.xz`)
            a.appDir = join(global.Server.AppDir!, `nginx-${a.version}`)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Nginx-${a.version}`
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
        all = [versionLocalFetch(setup?.nginx?.dirs ?? [], 'nginx.exe')]
      } else {
        all = [versionLocalFetch(setup?.nginx?.dirs ?? [], 'nginx', 'nginx')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -v`
            const reg = /(\/)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
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
    await super._installSoftHandle(row)
    if (!isWindows()) {
      const dir = row.appDir
      await moveChildDirToParent(dir)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all: Array<string> = ['nginx']
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
        `"^nginx\\d*$"`,
        (f) => {
          return f.includes('High-performance HTTP(S) server')
        },
        (name) => {
          return existsSync(join('/opt/local/sbin/', name))
        }
      )
      resolve(Info)
    })
  }
}
export default new Nginx()
