import type { AppHost as ForkAppHost } from '@shared/app'
import { I18nT } from '@lang/index'
import { AppStore, type AppHost } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { HostStore } from '@/components/Host/store'
import { TomcatSetup, tomcatCatalinaBase } from '@/components/Tomcat/setup'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { handleWriteHosts } from '@/util/Host'
import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import {
  TomcatSiteSaveOperation,
  type TomcatSaveRequest,
  type TomcatSaveResult
} from './TomcatSiteSaveOperation'

export { TomcatSiteSaveOperation } from './TomcatSiteSaveOperation'

export class TomcatSiteController {
  saving = false
  phase: 'idle' | 'saving' | 'restarting' | 'failed' | 'savedWithWarning' = 'idle'
  private readonly operation = new TomcatSiteSaveOperation({
    persist: (request) => this.persist(request),
    applyHosts: (hosts) => {
      AppStore().UPDATE_HOSTS(hosts as AppHost[])
      HostStore.updateCurrentList()
    },
    writeHosts: handleWriteHosts,
    restart: (request) => this.restart(request)
  })

  async save(host: AppHost, flag: 'add' | 'edit' | 'del', old?: AppHost): Promise<boolean> {
    if (this.saving) {
      return false
    }
    const version = this.runningVersion() ?? BrewStore().currentVersion('tomcat')
    if (!version) {
      MessageError(I18nT('base.needSelectVersion'))
      return false
    }
    this.saving = true
    this.phase = 'saving'
    try {
      await TomcatSetup.init()
      const wasRunning = !!version.run
      const request: TomcatSaveRequest = {
        host: JSON.parse(JSON.stringify(host)) as ForkAppHost,
        old: JSON.parse(JSON.stringify(old ?? {})) as ForkAppHost,
        flag,
        version: JSON.parse(JSON.stringify(version)),
        catalinaBase: tomcatCatalinaBase(version),
        wasRunning
      }
      const result = await this.operation.save(request)
      this.phase = this.operation.phase
      if (result) {
        if (this.phase === 'savedWithWarning') {
          MessageWarning(this.operation.error?.message ?? I18nT('host.warning'))
        } else {
          MessageSuccess(I18nT('base.success'))
        }
      } else {
        MessageError(this.operation.error?.message ?? I18nT('base.fail'))
      }
      return result
    } catch (error) {
      this.phase = 'failed'
      MessageError(error instanceof Error ? error.message : I18nT('base.fail'))
      return false
    } finally {
      this.saving = false
    }
  }

  private runningVersion() {
    return BrewStore()
      .module('tomcat')
      .installed.find((item) => item.run)
  }

  private restart(request: TomcatSaveRequest): Promise<string | boolean> {
    const version = BrewStore()
      .module('tomcat')
      .installed.find((item) => item.bin === request.version?.bin)
    return (version?.restart() ?? Promise.resolve(true)) as Promise<string | boolean>
  }

  private persist(request: TomcatSaveRequest): Promise<TomcatSaveResult> {
    return new Promise((resolve, reject) => {
      IPC.send(
        'app-fork:tomcat',
        'saveSite',
        request.version,
        request.catalinaBase,
        request.host,
        request.flag,
        request.old
      ).then((key: string, response: any) => {
        if (response?.code === 200) {
          return
        }
        IPC.off(key)
        if (response?.code === 0 && response.data?.host) {
          resolve(response.data)
        } else {
          reject(new Error(response?.msg ?? I18nT('base.fail')))
        }
      })
    })
  }
}

export default reactiveBind(new TomcatSiteController())
