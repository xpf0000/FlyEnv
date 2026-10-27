import IPC from '@/util/IPC'
import { AppStore } from '@/store/app'
import { reactiveBind } from '@/util/Index'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { I18nT } from '@lang/index'

type HostsOptions = { write: boolean; ipv6: boolean }

class HostsSettingsController {
  saving = false

  setWrite(value: boolean): Promise<boolean> {
    return this.run({ ...this.options(), write: value }, true)
  }

  setIPv6(value: boolean): Promise<boolean> {
    return this.run({ ...this.options(), ipv6: value }, true)
  }

  sync(): Promise<boolean> {
    return this.run(this.options(), false)
  }

  private options(): HostsOptions {
    const settings = AppStore().config.setup.hosts
    return { write: settings.write, ipv6: settings.ipv6 !== false }
  }

  private writeHosts(options: Readonly<HostsOptions>): Promise<void> {
    return new Promise((resolve, reject) => {
      IPC.send('app-fork:host', 'writeHosts', options.write, options.ipv6).then(
        (key: string, response: { code: number; data?: boolean; msg?: string }) => {
          if (response?.code === 200) return
          IPC.off(key)
          if (response?.code === 0 && response.data === true) {
            resolve()
          } else {
            reject(new Error(response?.msg || I18nT('base.hostsSaveFailed')))
          }
        }
      )
    })
  }

  private async run(options: HostsOptions, persist: boolean): Promise<boolean> {
    if (this.saving) return false
    this.saving = true
    const request = Object.freeze({ ...options })
    try {
      await this.writeHosts(request)
      if (persist) {
        // 只有系统 hosts 确认成功才提交开关；权限拒绝、取消或写入错误保留原配置。
        const store = AppStore()
        Object.assign(store.config.setup.hosts, request)
        try {
          await store.saveConfig()
        } catch (error) {
          // hosts 已生效，配置持久化失败不得撤销显示状态或重放系统写入。
          MessageWarning(
            I18nT('host.hostsAppliedPreferencesFailed', {
              error: error instanceof Error ? error.message : String(error)
            })
          )
          return true
        }
      }
      MessageSuccess(I18nT('base.success'))
      return true
    } catch (error) {
      MessageError(error instanceof Error ? error.message : I18nT('base.hostsSaveFailed'))
      return false
    } finally {
      this.saving = false
    }
  }
}

export default reactiveBind(new HostsSettingsController())
