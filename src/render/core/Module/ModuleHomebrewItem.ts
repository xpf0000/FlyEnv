import { clipboard } from '@/util/NodeFn'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
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

  async runCommand(..._args: unknown[]) {
    const { homebrewUpgrade } = await import('@/components/VersionManager/brew/Controller')
    return homebrewUpgrade.package({
      name: this.name,
      installed: this.installed,
      typeFlag: this.typeFlag
    })
  }
}
