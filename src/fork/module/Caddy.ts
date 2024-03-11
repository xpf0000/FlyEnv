import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { execPromise, spawnPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, remove } from 'fs-extra'
import { I18nT } from '../lang'

class Caddy extends Base {
  constructor() {
    super()
    this.type = 'caddy'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'caddy/caddy.pid')
  }

  initConfig() {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'caddy')
      const iniFile = join(baseDir, 'Caddyfile')
      if (!existsSync(iniFile)) {
        const tmplFile = join(global.Server.Static!, 'tmpl/Caddyfile')
        let content = await readFile(tmplFile, 'utf-8')
        const sslDir = join(baseDir, 'ssl')
        await mkdirp(sslDir)
        const logFile = join(baseDir, 'caddy.log')
        const vhostDir = join(global.Server.BaseDir!, 'vhost/caddy')
        await mkdirp(sslDir)
        content = content
          .replace('##SSL_ROOT##', sslDir)
          .replace('##LOG_FILE##', logFile)
          .replace('##VHOST-DIR##', vhostDir)
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'Caddyfile.default')
        await writeFile(defaultIniFile, content)
      }
      resolve(iniFile)
    })
  }

  fixLogPermit() {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'caddy')
      const logFile = join(baseDir, 'caddy.log')
      await execPromise(`echo '${global.Server.Password}' | sudo -S chmod 644 ${logFile}`)
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const iniFile = await this.initConfig()
      this.init()
      const shFile = join(global.Server.BaseDir!, 'caddy/caddy.sh')
      const command = `#!/bin/bash\necho '${global.Server.Password}' | sudo -S ${bin} start --config ${iniFile} --pidfile ${this.pidPath} --watch`
      await writeFile(shFile, command)
      await chmod(shFile, '0777')
      if (existsSync(this.pidPath)) {
        await remove(this.pidPath)
      }
      const checkPid = async (time = 0) => {
        if (existsSync(this.pidPath)) {
          resolve(true)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkPid(time + 1)
          } else {
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }
      try {
        spawnPromise('zsh', [shFile], {
          detached: true,
          stdio: 'ignore'
        })
          .on(on)
          .then(() => {
            checkPid()
          })
          .catch(reject)
      } catch (e: any) {
        reject(e)
      }
    })
  }
}
export default new Caddy()
