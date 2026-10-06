import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import { readFile } from '../../Fn'
import { join } from 'path'

class MacPorts extends Base {
  /** Return preview contents; the controller owns snapshots and terminal application. */
  changSrc(src: { url: string; rsync_server: string; rsync_dir: string }) {
    return new ForkPromise(async (resolve) => {
      if ([src.url, src.rsync_server, src.rsync_dir].some((value) => /[\r\n\0]/.test(value)))
        throw new Error('MacPorts source values must be single lines')
      const sourcesConf = '/opt/local/etc/macports/sources.conf'
      const macportsConf = '/opt/local/etc/macports/macports.conf'
      const sourceText = await readFile(sourcesConf, 'utf8')
      const configText = await readFile(macportsConf, 'utf8')
      const sources =
        sourceText.replace(/^(?:\s*rsync:\/\/.*\[default\])$/gm, '').trim() +
        `\n${src.url} [default]\n`
      let config = configText.replace(/^\s*rsync_(?:server|dir)\s.*$/gm, '').trim()
      if (src.rsync_server)
        config += `\nrsync_server ${src.rsync_server}\nrsync_dir ${src.rsync_dir}`
      const files = [
        { path: sourcesConf, content: sources },
        { path: macportsConf, content: config + '\n' }
      ]
      resolve({ files })
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return [
      { name: 'MacPorts 主配置', path: join('/opt/local/etc/macports', 'macports.conf') },
      { name: 'MacPorts 源配置', path: join('/opt/local/etc/macports', 'sources.conf') }
    ]
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }
}

export default new MacPorts()
