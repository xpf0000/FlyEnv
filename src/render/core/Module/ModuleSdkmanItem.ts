import { clipboard } from '@/util/NodeFn'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { nextTick } from 'vue'
import XTerm from '@/util/XTerm'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'
import { SdkmanSetup } from '@/components/VersionManager/sdkman/setup'

export class ModuleSdkmanItem {
  typeFlag: AllAppModule = 'dns'
  version: string = ''
  installed: boolean = false
  name: string = ''
  vendor: string = ''
  identifier: string = ''

  constructor(item: any) {
    Object.assign(this, item)
  }

  fetchCommand() {
    const fn = this.installed ? 'uninstall' : 'install'
    // For java use identifier, for maven use version
    const candidate = this.typeFlag === 'java' ? 'java' : 'maven'
    const target = this.identifier || this.version
    return `sdk ${fn} ${candidate} ${target}`
  }

  copyCommand() {
    const command = this.fetchCommand()
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  async runCommand(dom: HTMLElement) {
    if (SdkmanSetup.installing) {
      return
    }
    SdkmanSetup.installing = true
    SdkmanSetup.installEnd = false
    const fn = this.installed ? 'uninstall' : 'install'
    const candidate = this.typeFlag === 'java' ? 'java' : 'maven'
    const target = this.identifier || this.version
    const sdkmanHome = window.Server.SdkmanHome
    const initCmd = `source "${sdkmanHome}/bin/sdkman-init.sh"`
    const params = [`${initCmd} && sdk ${fn} ${candidate} ${target}`]
    const appStore = AppStore()
    const proxyStr = appStore.config.setup.proxy?.proxy
    if (proxyStr) {
      params.unshift(proxyStr)
    }
    await nextTick()
    const execXTerm = new XTerm()
    SdkmanSetup.xterm = execXTerm
    await execXTerm.mount(dom)
    await execXTerm.send(params)
    SdkmanSetup.installEnd = true
  }
}
