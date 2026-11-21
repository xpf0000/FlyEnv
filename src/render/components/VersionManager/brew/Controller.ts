import { ElMessage } from 'element-plus'
import { markRaw } from 'vue'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { BrewStore } from '@/store/brew'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import type { AllAppModule } from '@/core/type'
import { HomebrewUpgradeController } from './UpgradeController'
import type { BrewPackageProgress, BrewPackageResult } from '@fork/module/Brew/UpgradeTypes'
import XTerm from '@/util/XTerm'
import { BrewSetup } from './setup'

export const brewRequest = (
  action: string,
  args: unknown[],
  progress?: (data: BrewPackageProgress) => void
): Promise<any> =>
  new Promise((resolve, reject) => {
    const request = IPC.send('app-fork:brew', action, ...args)
    let settled = false
    request.then((key: string, info: any) => {
      if (settled) return
      if (info?.code === 200) {
        if (typeof info.msg === 'string' || typeof info.msg?.terminalId === 'string')
          progress?.(info.msg)
        return
      }
      settled = true
      IPC.off(key)
      if (info?.code === 0) resolve(info.data)
      else if (['executeUpgrade', 'packageOperation'].includes(action))
        resolve({
          operationId: '',
          action: action === 'executeUpgrade' ? 'upgrade' : args[0],
          outcome: info?.outcome === 'unknown' ? 'unknown' : 'failed',
          error: info?.msg,
          logs: ''
        })
      else reject(new Error(info?.msg || I18nT('base.fail')))
    })
  })

export const homebrewUpgrade = reactiveBind(
  new HomebrewUpgradeController({
    call: brewRequest,
    terminal: {
      open: () => {
        if (BrewSetup.installing) throw new Error('Homebrew installation is busy')
        BrewSetup.xterm?.destroy()
        BrewSetup.xterm = markRaw(new XTerm())
      },
      attach: (key, onData) => {
        void BrewSetup.xterm?.mount(undefined, { key, onData })
      },
      stop: () => BrewSetup.xterm?.stop(),
      end: () => {
        if (BrewSetup.xterm) BrewSetup.xterm.end = true
      },
      close: () => {
        BrewSetup.xterm?.destroy()
        BrewSetup.xterm = undefined
      }
    },
    stop: async (target) => {
      // Main's accepted PID snapshot, not a stale mounted row, is the stop target.
      const item = new ModuleInstalledItem({ ...target.item, run: true, running: false })
      item.typeFlag = target.module as AllAppModule
      return item.stop()
    },
    refresh: async (flag) => {
      const module = BrewStore().module(flag as AllAppModule)
      module.installedFetched = false
      const results = await Promise.allSettled([
        module
          .fetchInstalled(false, { updateCurrent: false, pruneNotes: false, fresh: true })
          .then((ok) => {
            if (!ok) throw new Error('Installed version refresh failed')
          }),
        module.fetchBrew(true).then(async (ok) => {
          if (!ok) throw new Error('Homebrew catalog refresh failed')
          await homebrewUpgrade.loadCatalog(
            module.brew.filter((row) => row.installed).map((row) => row.name),
            flag
          )
        })
      ])
      const errors = results.filter((r) => r.status === 'rejected')
      if (errors.length)
        throw new Error(
          errors.map((r) => (r.status === 'rejected' ? String(r.reason) : '')).join('\n')
        )
    },
    notify: (result: BrewPackageResult, refreshFailed: boolean) => {
      const key =
        result.outcome === 'succeeded'
          ? result.postprocessError
            ? 'brewPackagePartial'
            : refreshFailed
              ? 'brewUpgradeRefreshFailed'
              : result.action === 'upgrade'
                ? 'brewUpgradeSuccess'
                : 'brewPackageSuccess'
          : result.outcome === 'unknown'
            ? 'brewUpgradePhase.unknown'
            : 'brewUpgradePhase.failed'
      const message = I18nT(
        result.outcome === 'failed' && result.action !== 'upgrade'
          ? 'base.fail'
          : `versionmanager.${key}`
      )
      const detail = result.postprocessError || result.error
      ElMessage({
        type:
          result.outcome === 'succeeded' && !refreshFailed && !result.postprocessError
            ? 'success'
            : 'warning',
        message: detail ? `${message}\n${detail}` : message,
        duration: 7000,
        showClose: true
      })
    }
  })
)
