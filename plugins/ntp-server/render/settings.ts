import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { reactiveBind } from '@/util/Index'
import { ntpModuleId } from '../config'
import type { ConfigSnapshot } from '../config'
import { t } from './lang'

class SettingsController {
  busy = false
  error = ''
  private initializing?: Promise<string | undefined>
  private reading?: Promise<ConfigSnapshot | undefined>

  prepareConfig() {
    if (this.initializing) return this.initializing
    this.busy = true
    this.error = ''
    this.initializing = this.request<string>('initConfig')
      .catch((error: Error) => {
        this.error = error.message
        return undefined
      })
      .finally(() => {
        this.busy = false
        this.initializing = undefined
      })
    return this.initializing
  }

  load() {
    this.reading ??= this.request<ConfigSnapshot>('getSettings')
      .catch(() => undefined)
      .finally(() => {
        this.reading = undefined
      })
    return this.reading
  }

  private async request<T>(method: 'initConfig' | 'getSettings') {
    const { code, data, msg } = await forkTerminalRequest(
      `app-fork:${ntpModuleId}`,
      [method],
      t('requestTimeout'),
      30_000
    )
    if (code !== 0) throw new Error(String(msg))
    return data as T
  }
}

export const settingsController = reactiveBind(new SettingsController())
