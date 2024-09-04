import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp } from 'fs-extra'
import { execPromiseRoot } from '@shared/Exec'
class Nginx extends Base {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
  }

  async #handlePhpEnableConf() {
    const hostfile = join(global.Server.BaseDir!, 'host.json')
    let host = []
    if (existsSync(hostfile)) {
      try {
        const content = await readFile(hostfile, 'utf-8')
        host = JSON.parse(content)
      } catch (e) {}
    }
    const all = new Set(host.map((h: any) => h.phpVersion).filter((h: number | undefined) => !!h))
    const tmplFile = join(global.Server.Static!, 'tmpl/enable-php.conf')
    let tmplContent = ''
    for (const v of all) {
      const name = `enable-php-${v}.conf`
      const confFile = join(global.Server.NginxDir!, 'common/conf/', name)
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#handlePhpEnableConf()
      console.log('_startServer: ', version)
      const bin = version.bin
      const c = join(global.Server.NginxDir!, 'common/conf/nginx.conf')
      const pid = join(global.Server.NginxDir!, 'common/logs/nginx.pid')
      const errlog = join(global.Server.NginxDir!, 'common/logs/error.log')
      const g = `pid ${pid};error_log ${errlog};`
      const command = `${bin} -c ${c} -g '${g}'`
      console.log('command: ', command)
      try {
        const res = await execPromiseRoot([bin, '-c', c, '-g', `${g}`])
        on(res.stdout)
        resolve(0)
      } catch (e: any) {
        reject(e)
      }
    })
  }
}
export default new Nginx()
