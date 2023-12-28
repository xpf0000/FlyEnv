import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { AppHost, SoftInstalled } from '@shared/app'
import { execPromise, getAllFileAsync, md5 } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp } from 'fs-extra'

class Apache extends Base {
  constructor() {
    super()
    this.type = 'apache'
  }

  init() {
    this.pidPath = join(global.Server.ApacheDir!, 'common/logs/httpd.pid')
  }

  #resetConf(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const defaultFile = join(global.Server.ApacheDir!, `common/conf/${md5(version.bin)}.conf`)
      const defaultFileBack = join(
        global.Server.ApacheDir!,
        `common/conf/${md5(version.bin)}.default.conf`
      )
      let logs = join(global.Server.ApacheDir!, 'common/logs')
      await mkdirp(logs)
      const bin = version.bin
      if (existsSync(defaultFile)) {
        resolve(true)
        return
      }
      // 获取httpd的默认配置文件路径
      const res = await execPromise(`${bin} -D DUMP_INCLUDES`)
      const str = res?.stdout?.toString() ?? ''
      let reg = new RegExp('(\\(*\\) )([\\s\\S]*?)(\\n)', 'g')
      let file = ''
      try {
        file = reg?.exec?.(str)?.[2] ?? ''
      } catch (e) {}
      file = file.trim()
      if (!file || !existsSync(file)) {
        reject(new Error(I18nT('fork.confNoFound')))
        return
      }
      let content = await readFile(file, 'utf-8')
      reg = new RegExp('(CustomLog ")([\\s\\S]*?)(access_log")', 'g')
      let path = ''
      try {
        path = reg?.exec?.(content)?.[2] ?? ''
      } catch (e) {}
      path = path.trim()
      if (!path) {
        reject(new Error(I18nT('fork.apacheLogPathErr')))
        return
      }
      logs = join(global.Server.ApacheDir!, 'common/logs/')
      const vhost = join(global.Server.BaseDir!, 'vhost/apache/')
      content = content
        .replace(new RegExp(path, 'g'), logs)
        .replace('#LoadModule deflate_module', 'LoadModule deflate_module')
        .replace('#LoadModule proxy_module', 'LoadModule proxy_module')
        .replace('#LoadModule proxy_fcgi_module', 'LoadModule proxy_fcgi_module')
        .replace('#LoadModule ssl_module', 'LoadModule ssl_module')

      let find = content.match(/\nUser _www(.*?)\n/g)
      content = content.replace(find?.[0] ?? '###@@@&&&', '\n#User _www\n')
      find = content.match(/\nGroup _www(.*?)\n/g)
      content = content.replace(find?.[0] ?? '###@@@&&&', '\n#Group _www\n')

      content += `\nPidFile "${logs}httpd.pid"
IncludeOptional "${vhost}*.conf"`
      await writeFile(defaultFile, content)
      await writeFile(defaultFileBack, content)
      resolve(true)
    })
  }

  async #handleListenPort(version: SoftInstalled) {
    const hostfile = join(global.Server.BaseDir!, 'host.json')
    const json = await readFile(hostfile, 'utf-8')
    let host: Array<AppHost> = []
    try {
      host = JSON.parse(json)
    } catch (e) {}
    const allNeedPort: Set<number> = new Set()
    host.forEach((h) => {
      const apache = Number(h?.port?.apache)
      const apache_ssl = Number(h?.port?.apache_ssl)
      if (apache && !isNaN(apache)) {
        allNeedPort.add(apache)
      }
      if (apache_ssl && !isNaN(apache_ssl)) {
        allNeedPort.add(apache_ssl)
      }
    })
    const portRegex = /<VirtualHost\s+\*:(\d+)>/g
    const regex = /([\s\n]?[^\n]*)Listen\s+\d+(.*?)([^\n])(\n|$)/g
    const allVhostFile = await getAllFileAsync(join(global.Server.BaseDir!, 'vhost/apache'))
    for (const file of allVhostFile) {
      portRegex.lastIndex = 0
      regex.lastIndex = 0
      let content = await readFile(file, 'utf-8')
      if (regex.test(content)) {
        regex.lastIndex = 0
        content = content.replace(regex, '\n').replace(/\n+/g, '\n').trim()
        await writeFile(file, content)
      }
      let m
      while ((m = portRegex.exec(content)) !== null) {
        if (m && m.length > 1) {
          const port = Number(m[1])
          if (port && !isNaN(port)) {
            allNeedPort.add(port)
          }
        }
      }
    }
    console.log('allNeedPort: ', allNeedPort)
    const name = md5(version.bin!)
    const configpath = join(global.Server.ApacheDir!, `common/conf/${name}.conf`)
    let confContent = await readFile(configpath, 'utf-8')
    regex.lastIndex = 0
    if (regex.test(confContent)) {
      regex.lastIndex = 0
      confContent = confContent.replace(regex, '\n').replace(/\n+/g, '\n').trim()
    }
    confContent = confContent
      .replace(/#PhpWebStudy-Apache-Listen-Begin#([\s\S]*?)#PhpWebStudy-Apache-Listen-End#/g, '')
      .replace(/\n+/g, '\n')
      .trim()
    const txts: Array<string> = Array.from(allNeedPort).map((s) => `Listen ${s}`)
    txts.unshift('#PhpWebStudy-Apache-Listen-Begin#')
    txts.push('#PhpWebStudy-Apache-Listen-End#')
    confContent = txts.join('\n') + '\n' + confContent
    await writeFile(configpath, confContent)
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#resetConf(version)
      await this.#handleListenPort(version)
      const logs = join(global.Server.ApacheDir!, 'common/logs')
      await mkdirp(logs)
      const bin = version.bin
      const conf = join(global.Server.ApacheDir!, `common/conf/${md5(version.bin)}.conf`)
      if (!existsSync(conf)) {
        reject(new Error(I18nT('fork.confNoFound')))
        return
      }
      try {
        const res = await execPromise(
          `echo '${global.Server.Password}' | sudo -S ${bin} -f ${conf} -k start`
        )
        on(res?.stdout)
        resolve(0)
      } catch (e: any) {
        reject(e)
      }
    })
  }
}

export default new Apache()
