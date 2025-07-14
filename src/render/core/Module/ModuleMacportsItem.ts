import { clipboard, fs } from '@/util/NodeFn'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { join } from '@/util/path-browserify'
import { nextTick } from 'vue'
import XTerm from '@/util/XTerm'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'
import { MacPortsSetup } from '@/components/VersionManager/port/setup'

export class ModuleMacportsItem {
  typeFlag: AllAppModule = 'dns'
  version: string = ''
  installed: boolean = false
  name: string = ''

  constructor(item: any) {
    Object.assign(this, item)
  }

  fetchCommand() {
    let fn = ''
    if (this.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }

    const name = this.name
    const names = [name]
    if (this.typeFlag === 'php') {
      names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`, `${name}-iconv`)
    } else if (this.typeFlag === 'mysql') {
      names.push(`${name}-server`)
    } else if (this.typeFlag === 'mariadb') {
      names.push(`${name}-server`)
    } else if (this.typeFlag === 'python') {
      names.push(`${name.replace('python', 'py')}-pip`)
    }
    const params: string[] = []
    if (['php52', 'php53', 'php54', 'php55', 'php56'].includes(name) && fn === 'install') {
      const libs = names.join(' ')
      params.push(`sudo port clean -v ${libs}`)
      names.forEach((name) => {
        params.push(`sudo port install -v ${name} configure.compiler=macports-clang-10`)
      })
    } else {
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      const nameStr = names.join(' ')
      params.push(`sudo port clean -v ${nameStr}`)
      params.push(`sudo port ${fn} -v ${nameStr}`)
    }

    return params.join('\n')
  }

  copyCommand() {
    const command = this.fetchCommand()
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  async runCommand(dom: HTMLElement) {
    if (MacPortsSetup.installing) {
      return
    }
    MacPortsSetup.installing = true
    MacPortsSetup.installEnd = false
    let fn = ''
    if (this.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }
    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const name = this.name
    let params = []

    const names = [name]
    if (this.typeFlag === 'php') {
      names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`, `${name}-iconv`)
    } else if (this.typeFlag === 'mysql') {
      names.push(`${name}-server`)
    } else if (this.typeFlag === 'mariadb') {
      names.push(`${name}-server`)
    } else if (this.typeFlag === 'python') {
      names.push(`${name.replace('python', 'py')}-pip`)
    }
    if (['php52', 'php53', 'php54', 'php55', 'php56'].includes(name) && fn === 'install') {
      const sh = join(window.Server.Static!, 'sh/port-cmd-user.sh')
      const copyfile = join(window.Server.Cache!, 'port-cmd-user.sh')
      const exists = await fs.existsSync(copyfile)
      if (exists) {
        await fs.remove(copyfile)
      }
      const libs = names.join(' ')
      const arrs = [
        `echo "arch ${arch} sudo port clean -v ${libs}"`,
        `arch ${arch} sudo -S port clean -v ${libs}`
      ]
      names.forEach((name) => {
        arrs.push(
          `echo "arch ${arch} sudo port install -v ${name} configure.compiler=macports-clang-10"`
        )
        arrs.push(
          `arch ${arch} sudo -S port install -v ${name} configure.compiler=macports-clang-10`
        )
      })
      arrs.unshift(`arch ${arch} sudo -S port -f deactivate libuuid`)
      let content = await fs.readFile(sh)
      content = content.replace('##CONTENT##', arrs.join('\n'))
      await fs.writeFile(copyfile, content)
      await fs.chmod(copyfile, '0777')
      params = [`sudo -S "${copyfile}"`]
    } else {
      const sh = join(window.Server.Static!, 'sh/port-cmd.sh')
      const copyfile = join(window.Server.Cache!, 'port-cmd.sh')
      const exists = await fs.existsSync(copyfile)
      if (exists) {
        await fs.remove(copyfile)
      }
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      let content = await fs.readFile(sh)
      content = content
        .replace(new RegExp('##ARCH##', 'g'), arch)
        .replace(new RegExp('##ACTION##', 'g'), fn)
        .replace(new RegExp('##NAME##', 'g'), names.join(' '))
      await fs.writeFile(copyfile, content)
      await fs.chmod(copyfile, '0777')
      params = [`sudo -S "${copyfile}"`]
    }
    const appStore = AppStore()
    const proxyStr = appStore.config.setup.proxy?.proxy
    if (proxyStr) {
      params.unshift(proxyStr)
    }
    await nextTick()
    const execXTerm = new XTerm()
    MacPortsSetup.xterm = execXTerm
    await execXTerm.mount(dom)
    await execXTerm.send(params)
    MacPortsSetup.installEnd = true
  }
}
