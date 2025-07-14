import { clipboard, fs } from '@/util/NodeFn'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { join } from '@/util/path-browserify'
import { nextTick } from 'vue'
import XTerm from '@/util/XTerm'
import { BrewSetup } from '@/components/VersionManager/brew/setup'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'

export class ModuleHomebrewItem {
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
    return `brew ${fn} ${this.name}`
  }

  copyCommand() {
    const command = this.fetchCommand()
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  async runCommand(dom: HTMLElement) {
    if (BrewSetup.installing) {
      return
    }
    BrewSetup.installing = true
    BrewSetup.installEnd = false
    let fn = ''
    if (this.installed) {
      fn = 'uninstall'
    } else {
      fn = 'install'
    }
    const arch = window.Server.isArmArch ? '-arm64' : '-x86_64'
    const name = this.name
    let params = []
    const sh = join(window.Server.Static!, 'sh/brew-cmd.sh')
    const copyfile = join(window.Server.Cache!, 'brew-cmd.sh')
    const exists = await fs.existsSync(copyfile)
    if (exists) {
      await fs.remove(copyfile)
    }
    await fs.copyFile(sh, copyfile)
    await fs.chmod(copyfile, '0777')
    params = [`${copyfile} ${arch} ${fn} ${name};`]
    const appStore = AppStore()
    const proxyStr = appStore.config.setup.proxy?.proxy
    if (proxyStr) {
      params.unshift(proxyStr)
    }
    await nextTick()
    const execXTerm = new XTerm()
    BrewSetup.xterm = execXTerm
    await execXTerm.mount(dom)
    await execXTerm.send(params)
    BrewSetup.installEnd = true
  }
}
