import { dirname, join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  serviceStartExec,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  execPromiseWithEnv,
  zipUnpack,
  copyFile,
  chmod,
  binXattrFix
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import { appDebugLog, isLinux, isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'
import process from 'node:process'
import { fixVHost } from './Host'

class FrankenPHP extends Base {
  constructor() {
    super()
    this.type = 'frankenphp'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'frankenphp/frankenphp.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, _reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'frankenphp')
      await mkdirp(baseDir)
      const iniFile = join(baseDir, 'Caddyfile')
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const isZh = global.Server.Lang === 'zh'
        const tmplFile = join(
          global.Server.Static!,
          isZh ? 'tmpl/frankenphp.zh.Caddyfile' : 'tmpl/frankenphp.Caddyfile'
        )
        let content = await readFile(tmplFile, 'utf-8')
        const logFile = join(baseDir, 'frankenphp.log')
        const vhostDir = join(global.Server.BaseDir!, 'vhost/frankenphp')
        content = content
          .replace('##LOG_FILE##', pathFixedToUnix(logFile))
          .replace('##VHOST-DIR##', pathFixedToUnix(vhostDir))
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'Caddyfile.default')
        await writeFile(defaultIniFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      resolve(iniFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `frankenphp-${version.version}` })
        )
      })

      await fixVHost()
      const iniFile = await this.initConfig().on(on)
      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'frankenphp')
      await mkdirp(baseDir)

      if (isLinux()) {
        // Linux web servers bind privileged ports (80/443) and need root,
        // which serviceStartSpawn cannot provide — keep the Helper script path.
        const execEnv = ``
        const execArgs = `run --config "${iniFile}" --pidfile "${this.pidPath}"`
        try {
          const res = await serviceStartExec({
            root: true,
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            execEnv,
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('frankenphp start err: ', e)
          reject(e)
          return
        }
      } else {
        const execArgs = ['run', '--config', iniFile, '--pidfile', this.pidPath]
        try {
          const res = await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir,
            bin,
            execArgs,
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('frankenphp start err: ', e)
          reject(e)
          return
        }
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('frankenphp')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `frankenphp`, a.version, 'frankenphp.exe')
            zip = join(global.Server.Cache!, `frankenphp-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `frankenphp`, a.version)
          } else {
            dir = join(global.Server.AppDir!, `frankenphp`, a.version, 'frankenphp')
            zip = join(global.Server.Cache!, `frankenphp-${a.version}`)
            a.appDir = join(global.Server.AppDir!, `frankenphp`, a.version)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `FrankenPHP-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      const dir = row.appDir
      await mkdirp(dir)
      await copyFile(row.zip, row.bin)
      await chmod(row.bin, '0755')
      if (isMacOS()) {
        await binXattrFix(row.bin)
      }
    }
  }

  binVersion = (
    bin: string,
    command: string
  ): Promise<{ version?: string; php?: string; caddy?: string; error?: string }> => {
    return new Promise(async (resolve) => {
      const reg = /(FrankenPHP )(.*?)( PHP )(.*?)( Caddy )(.*?)( )/g
      const handleCatch = (err: any) => {
        resolve({
          error: `${command}\n${err}`,
          version: undefined
        })
      }
      const handleThen = (res: any) => {
        let str = res.stdout + res.stderr
        str = str.replace(new RegExp(`\r\n`, 'g'), `\n`)
        let version: string | undefined = ''
        let php: string | undefined = ''
        let caddy: string | undefined = ''
        try {
          const arr = reg?.exec(str)
          version = arr?.[2]?.replace('(Homebrew)', '')?.replace('v', '')?.trim()
          php = arr?.[4]?.replace('v', '')?.trim()
          caddy = arr?.[6]?.replace('v', '')?.trim()
          reg!.lastIndex = 0
        } catch {}
        resolve({
          version,
          php,
          caddy
        })
      }
      const cwd = dirname(bin)
      try {
        process.chdir(cwd)
        const res = await execPromiseWithEnv(command, {
          cwd,
          shell: undefined
        })
        console.log('versionBinVersion: ', command, bin, res)
        handleThen(res)
      } catch (e) {
        console.log('versionBinVersion err: ', e)
        appDebugLog('[versionBinVersion][error]', `${e}`).catch()
        handleCatch(e)
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.frankenphp?.dirs ?? [], 'frankenphp.exe')]
      } else {
        all = [versionLocalFetch(setup?.frankenphp?.dirs ?? [], 'frankenphp', 'frankenphp')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            return TaskQueue.run(this.binVersion, item.bin, command)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version, php, caddy } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              php,
              caddy,
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

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'frankenphp')
    const files: Array<{ name: string; path: string }> = []
    try {
      if (existsSync(baseDir)) {
        const mainLog = join(baseDir, 'frankenphp.log')
        if (existsSync(mainLog)) {
          files.push({ name: 'frankenphp', path: mainLog })
        }
        const list = readdirSync(baseDir)
        list.forEach((name) => {
          if (name.startsWith('frankenphp-') && name.endsWith('.log')) {
            files.push({
              name: name.replace('.log', ''),
              path: join(baseDir, name)
            })
          }
        })
      }
    } catch (e) {
      console.log('frankenphp getLogFiles error: ', e)
    }
    return files
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const allTap = await execPromiseWithEnv('brew tap')
        if (!allTap.stdout.includes('dunglas/frankenphp')) {
          await execPromiseWithEnv('brew tap dunglas/frankenphp')
        }
        const all = ['frankenphp']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }

      try {
        const all = ['frankenphp']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    const baseDir = join(global.Server.BaseDir!, 'frankenphp')
    return [
      { name: 'Caddyfile', path: join(baseDir, 'Caddyfile') },
      { name: 'Caddyfile.default', path: join(baseDir, 'Caddyfile.default') }
    ]
  }
}

export default new FrankenPHP()
