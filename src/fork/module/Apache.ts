import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromise, md5 } from '../Fn'
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
      console.log('DUMP_INCLUDES: ', str)
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#resetConf(version)
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
