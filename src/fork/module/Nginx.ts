import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { createFolder, execPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
class Nginx extends Base {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
  }

  #handlePhpEnableConf() {
    const hostfile = join(global.Server.BaseDir!, 'host.json')
    let host = []
    if (existsSync(hostfile)) {
      try {
        const content = readFileSync(hostfile, 'utf-8')
        host = JSON.parse(content)
      } catch (e) {}
    }
    const all = new Set(host.map((h: any) => h.phpVersion).filter((h: number | undefined) => !!h))
    const tmplFile = join(global.Server.Static!, 'tmpl/enable-php.conf')
    let tmplContent = ''
    all.forEach((v: number) => {
      const name = `enable-php-${v}.conf`
      const confFile = join(global.Server.NginxDir!, 'common/conf/', name)
      console.log('confFile: ', confFile)
      if (!existsSync(confFile)) {
        createFolder(dirname(confFile))
        if (!tmplContent) {
          tmplContent = readFileSync(tmplFile, 'utf-8')
        }
        const content = tmplContent.replace('##VERSION##', `${v}`)
        writeFileSync(confFile, content)
      }
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      this.#handlePhpEnableConf()
      const bin = version.bin
      const c = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
      const pid = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
      const errlog = join(global.Server.NginxDir!, 'common/logs/error.log')
      const g = `pid ${pid};error_log ${errlog};`
      execPromise(`echo '${global.Server.Password}' | sudo -S ${bin} -c ${c} -g '${g}'`)
        .then((res) => {
          on(res.stdout)
          resolve(0)
        })
        .catch((err) => {
          on(err.toString())
          reject(err)
        })
    })
  }
}
export default new Nginx()
