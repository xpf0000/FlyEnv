import { markRaw } from 'vue'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import HelperStore from '@/store/helper'

class FlyEnvHelperController {
  show = false
  loading = false
  command = ''
  caFingerprint?: string
  execXTerm?: XTerm
  private installation?: Promise<boolean>

  async open(): Promise<void> {
    if (this.show || HelperStore.show || HelperStore.isInstalling()) return
    this.show = true
    if (!this.loading) {
      this.command = ''
      this.caFingerprint = undefined
    }
    const fail = (error: unknown) => {
      this.show = false
      MessageError(`${I18nT('menu.helperInstallFailTips')}: ${error}`)
    }
    try {
      const component = await import('@/components/FlyEnvHelper/index.vue')
      // The dialog only closes; it does not submit an installation result.
      AsyncComponentShow(component.default).catch(fail)
    } catch (error) {
      fail(error)
    }
  }

  private fetchCommand(): Promise<string> {
    return new Promise((resolve, reject) => {
      IPC.send('APP:FlyEnv-Helper-Command').then((key: string, res: any) => {
        if (res?.code === 200) return
        IPC.off(key)
        if (res?.code !== 0 || !res?.command) {
          reject(new Error(res?.msg ?? res?.reason ?? 'helper_binary_missing'))
          return
        }
        this.command = res.command
        this.caFingerprint = res.caFingerprint
        resolve(res.command)
      })
    })
  }

  install(target: HTMLElement): Promise<boolean> {
    if (this.installation) return this.installation
    this.loading = true
    this.installation = this.run(target).finally(() => {
      this.loading = false
      this.installation = undefined
      if (!this.show) this.destroyTerminal()
    })
    return this.installation
  }

  private async run(target: HTMLElement): Promise<boolean> {
    try {
      const command = await this.fetchCommand()
      if (!this.show) return false
      const terminal = markRaw(new XTerm())
      this.execXTerm = terminal
      await terminal.mount(target)
      const execution = terminal.send([command], true, true)
      if (!execution) throw new Error('Installation terminal is unavailable')
      await execution
      if (!(await HelperStore.verifyHelperReady())) {
        throw new Error(I18nT('menu.helperInstallFailTips'))
      }
      MessageSuccess(I18nT('setup.flyenvHelperFixSuccess'))
      return true
    } catch (error) {
      MessageError(`${I18nT('menu.helperInstallFailTips')}: ${error}`)
      await this.execXTerm?.stop().catch((stopError) => console.error(stopError))
      this.destroyTerminal()
      return false
    }
  }

  async mount(target: HTMLElement) {
    if (this.execXTerm) {
      try {
        await this.execXTerm.mount(target)
      } catch (error) {
        MessageError(`${I18nT('menu.helperInstallFailTips')}: ${error}`)
      }
    } else {
      await this.install(target)
    }
  }

  detach() {
    this.show = false
    this.execXTerm?.unmounted()
    if (!this.loading) this.destroyTerminal()
  }

  private destroyTerminal() {
    this.execXTerm?.destroy()
    this.execXTerm = undefined
  }
}

export const FlyEnvHelperSetup = reactiveBind(new FlyEnvHelperController())
