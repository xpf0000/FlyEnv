import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  binXattrFix,
  chmod,
  copyFile,
  downloadFile,
  execPromiseWithEnv,
  getAllFileAsync,
  mkdirp,
  moveChildDirToParent,
  remove,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { appDebugLog, isMacOS, isWindows } from '@shared/utils'

const composerDownloadUrl = 'https://getcomposer.org/download/latest-stable/composer.phar'
const cacertDownloadUrl = 'https://curl.se/ca/cacert.pem'

class SwooleCli extends Base {
  constructor() {
    super()
    this.type = 'swoole-cli'
  }

  managedAppDir(bin: string) {
    const appBase = join(global.Server.AppDir!, 'swoole-cli')
    return bin.startsWith(`${appBase}/`) || bin.startsWith(`${appBase}\\`)
  }

  runtimeIni(appDir: string) {
    const certFile = join(appDir, 'cacert.pem')
    return `curl.cainfo="${certFile}"
openssl.cafile="${certFile}"
swoole.use_shortname=off
display_errors = On
error_reporting = E_ALL

upload_max_filesize="128M"
post_max_size="128M"
memory_limit="1G"
date.timezone="UTC"

opcache.enable=On
opcache.enable_cli=On
opcache.jit=1225
opcache.jit_buffer_size=128M

expose_php=Off
apc.enable_cli=1
`
  }

  runtimeFpmConf() {
    return `[global]
pid = run/php-fpm.pid
error_log = log/php-fpm.log
daemonize = yes

[www]
user = nobody
group = nobody

listen = 9001
;listen = run/php-fpm.sock

slowlog = log/$pool.log.slow
request_slowlog_timeout = 30s

pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
`
  }

  async downloadRuntimeFile(url: string, file: string) {
    if (existsSync(file)) {
      return
    }
    try {
      await downloadFile(url, file)
    } catch (e) {
      console.log('swoole-cli runtime file download error: ', url, e)
    }
  }

  async initRuntimeFiles(appDir: string, bin: string, withDownload = false) {
    if (!existsSync(bin) || !this.managedAppDir(bin)) {
      return
    }
    const runtimeDir = isWindows() ? dirname(bin) : appDir
    const phpBin = join(runtimeDir, isWindows() ? 'php.exe' : 'php')
    await copyFile(bin, phpBin)
    if (!isWindows()) {
      await chmod(phpBin, '0755')
    }

    const composer = join(runtimeDir, 'composer')
    const cacert = join(runtimeDir, 'cacert.pem')
    if (withDownload) {
      await this.downloadRuntimeFile(composerDownloadUrl, composer)
      await this.downloadRuntimeFile(cacertDownloadUrl, cacert)
    }
    if (!isWindows() && existsSync(composer)) {
      await chmod(composer, '0755')
    }

    await writeFile(join(runtimeDir, 'php.ini'), this.runtimeIni(runtimeDir))
    await writeFile(join(runtimeDir, 'php-fpm.conf'), this.runtimeFpmConf())
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('swoole-cli')
        all.forEach((a: any) => {
          const appDir = join(global.Server.AppDir!, 'swoole-cli', a.version)
          const bin = isWindows()
            ? join(appDir, 'bin', 'swoole-cli.exe')
            : join(appDir, 'swoole-cli')
          const zipName = basename(new URL(a.url).pathname)
          const zip = join(global.Server.Cache!, zipName)
          a.appDir = appDir
          a.zip = zip
          a.bin = bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin)
          a.name = `Swoole CLI-${a.version}`
        })
        resolve(all)
      } catch (e) {
        console.log('swoole-cli fetchAllOnlineVersion error: ', e)
        resolve([])
      }
    })
  }

  binVersion = (bin: string): Promise<{ version?: string; php?: string; error?: string }> => {
    return new Promise(async (resolve) => {
      const cwd = dirname(bin)
      const iniFile = join(cwd, 'php.ini')
      const iniArg = existsSync(iniFile) ? ` -c "${iniFile}"` : ''
      const commands = [
        `"${bin}"${iniArg} --ri swoole`,
        `"${bin}"${iniArg} -v`,
        `"${bin}" --ri swoole`,
        `"${bin}" -v`,
        `"${bin}" --version`
      ]
      const parse = (str: string) => {
        const fixed = str.replace(new RegExp(`\r\n`, 'g'), `\n`)
        const version =
          /^\s*Version\s*=>\s*v?(\d+(?:\.\d+){1,3})/im.exec(fixed)?.[1] ||
          /swoole(?:-cli)?[^\n]*?v?(\d+(?:\.\d+){1,3})/i.exec(fixed)?.[1]
        const php = /PHP\s+v?(\d+(?:\.\d+){1,3})/i.exec(fixed)?.[1]
        return {
          version,
          php
        }
      }
      let lastError: any
      for (const command of commands) {
        try {
          const res = await execPromiseWithEnv(command, {
            cwd,
            shell: undefined
          })
          console.log('swoole-cli binVersion: ', command, bin, res)
          const str = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
          const result = parse(str)
          if (result.version || result.php) {
            resolve({
              version: result.version || result.php,
              php: result.php
            })
            return
          }
        } catch (e) {
          lastError = e
        }
      }
      const error = `${lastError ?? ''}`
      appDebugLog('[swoole-cli][binVersion][error]', error).catch()
      resolve({
        error,
        version: undefined
      })
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [
          versionLocalFetch(setup?.['swoole-cli']?.dirs ?? [], 'swoole-cli.exe', undefined, [
            'bin/swoole-cli.exe',
            'swoole-cli.exe'
          ])
        ]
      } else {
        all = [
          versionLocalFetch(setup?.['swoole-cli']?.dirs ?? [], 'swoole-cli', 'swoole-cli', [
            'swoole-cli',
            'bin/swoole-cli',
            'runtime/swoole-cli/swoole-cli'
          ])
        ]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            return TaskQueue.run(
              async (bin: string, appDir: string) => {
                await this.initRuntimeFiles(appDir, bin)
                return this.binVersion(bin)
              },
              item.bin,
              item.path
            )
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const finalVersion = version || null
            const num = finalVersion
              ? Number(versionFixed(finalVersion).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: finalVersion,
              num,
              enable: !!finalVersion,
              error: finalVersion ? undefined : error
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
    await remove(row.appDir)
    await mkdirp(row.appDir)
    await super._installSoftHandle(row)
    if (isWindows()) {
      await moveChildDirToParent(row.appDir)
    }
    const files = await getAllFileAsync(row.appDir)
    const name = isWindows() ? 'swoole-cli.exe' : 'swoole-cli'
    const bin = files.find((file) => file.endsWith(`/${name}`) || file.endsWith(`\\${name}`))
    if (bin && bin !== row.bin) {
      await remove(row.bin)
      await mkdirp(dirname(row.bin))
      await copyFile(bin, row.bin)
    }
    if (!isWindows() && existsSync(row.bin)) {
      await chmod(row.bin, '0755')
    }
    if (isMacOS() && existsSync(row.bin)) {
      await binXattrFix(row.bin)
    }
    await this.initRuntimeFiles(row.appDir, row.bin, true)
  }
}

export default new SwooleCli()
