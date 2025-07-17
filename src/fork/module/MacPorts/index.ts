import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile } from '../../Fn'
import Helper from '../../Helper'
class MacPorts extends Base {
  constructor() {
    super()
  }

  /**
   * Change the source of macports
   * @param src
   */
  changSrc(src: { url: string; rsync_server: string; rsync_dir: string }) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const macportsConf = '/opt/local/etc/macports/macports.conf'
        const sourcesConf = '/opt/local/etc/macports/sources.conf'

        let content = await readFile(sourcesConf, 'utf-8')
        let regex = /^(?:\s*rsync:\/\/.*\[default\])$/gm
        let all: Array<string> = content.match(regex) ?? []
        all.forEach((a) => {
          content = content.replace(a, '')
        })
        content = content.trim() + '\n' + `${src.url} [default]`
        await Helper.send('tools', 'writeFileByRoot', sourcesConf, content)

        content = await readFile(macportsConf, 'utf-8')

        regex = /^(?:\s*rsync_server\s.*)$/gm
        all = content.match(regex) ?? []
        all.forEach((a) => {
          content = content.replace(a, '')
        })
        regex = /^(?:\s*rsync_dir\s.*)$/gm
        all = content.match(regex) ?? []
        all.forEach((a) => {
          content = content.replace(a, '')
        })
        if (src.rsync_server) {
          content =
            content.trim() +
            '\n' +
            `rsync_server ${src.rsync_server}` +
            '\n' +
            `rsync_dir ${src.rsync_dir}`
        }
        await Helper.send('tools', 'writeFileByRoot', macportsConf, content)

        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }
}

export default new MacPorts()
