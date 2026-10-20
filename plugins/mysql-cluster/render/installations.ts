import { markRaw } from 'vue'
import { reactiveBind } from '@/util/Index'
import { BrewStore } from '@/store/brew'
import { fetchVerion, brewInfo, portInfo } from '@/util/Brew'
import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { MessageError, MessageSuccess } from './notice'
import { shell, clipboard } from '@/util/NodeFn'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { installedVersionNote, setInstalledVersionNote } from '@/util/InstalledVersionNote'
import { VueExtend } from '@/core/VueExtend'
import { waitForDialog } from './dialog'
import XTerm from '@/util/XTerm'
import { findInstalledFormulaConflict } from '@/components/VersionManager/brew/FormulaConflict'
import { InstallationsController, type InstallationRow } from './installationsController'
import { installationAdmission } from './admission'
import { beforeRemove } from './versionGuard'
import { MysqlClusterManager } from './manager'
import { t } from './lang'

const mysql = () => BrewStore().module('mysql')
export async function refreshMysqlInstallations() {
  const m = mysql()
  m.installedFetched = false
  await m.fetchInstalled()
  if (!m.installedFetched) throw new Error('MySQL installation refresh failed')
}
async function pluginRpc(method: string, args: any[]) {
  const response = await forkTerminalRequest(
    'app-fork:mysql-cluster',
    [method, ...args],
    'Installation operation timed out',
    120_000
  )
  if (response.code !== 0) throw new Error(response.msg || 'Installation operation failed')
  return response.data
}
const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'"
class InstallationAdapter {
  terminal?: XTerm
  container?: HTMLDivElement
  host?: HTMLElement
  token = ''
  async command(row: InstallationRow) {
    const command = await pluginRpc('preparePackageCommand', [row.source, row.name, row.installed])
    this.token = command.token
    if (InstallationManager.cancelled) throw new Error('Operation cancelled')
    this.container = markRaw(document.createElement('div'))
    this.container.style.height = '280px'
    this.attach(this.host)
    this.terminal = markRaw(new XTerm())
    await this.terminal.mount(this.container)
    if (InstallationManager.cancelled) throw new Error('Operation cancelled')
    await this.terminal.send([[command.path, ...command.args].map(quote).join(' ')], true, true)
  }
  attach(host?: HTMLElement) {
    this.host = host
    if (!this.container) return
    if (host) {
      this.container.style.position = ''
      this.container.style.left = ''
      this.container.style.width = '100%'
      host.append(this.container)
      this.terminal?.onWindowResit()
    } else {
      Object.assign(this.container.style, { position: 'fixed', left: '-10000px', width: '900px' })
      document.body.append(this.container)
    }
  }
  async cleanup() {
    try {
      if (this.terminal && !this.terminal.end) await this.terminal.stop()
    } finally {
      if (this.terminal) InstallationManager.output = this.terminal.logs.join('').slice(-40000)
      this.terminal?.destroy()
      this.terminal = undefined
      this.container?.remove()
      this.container = undefined
    }
    if (this.token) {
      const token = this.token
      this.token = ''
      await pluginRpc('cleanupPackageCommand', [token])
    }
  }
}
const adapter = new InstallationAdapter()
export const InstallationManager = reactiveBind(
  new InstallationsController({
    list: async (source) => {
      const rows: any[] = await (source === 'Static'
        ? fetchVerion('mysql')
        : source === 'Homebrew'
          ? brewInfo('mysql')
          : portInfo('mysql'))
      return rows.map((row) => ({
        ...row,
        source,
        conflictingFormula:
          source === 'Homebrew' ? findInstalledFormulaConflict(row, rows) : undefined
      }))
    },
    installed: async () => {
      await refreshMysqlInstallations()
      await MysqlClusterManager.refresh()
    },
    confirm: async (row) => {
      const { ElMessageBox } = await import('element-plus')
      try {
        await ElMessageBox.confirm(`${t('removeVersionHint')}\n${row.name}`, t('delete'), {
          type: 'warning'
        })
        return true
      } catch {
        return false
      }
    },
    guard: async (row) => {
      if (!(await beforeRemove(row))) return false
      if (
        mysql().installed.some(
          (i) =>
            (i.run || i.running) &&
            (row.source !== 'Static' ||
              i.bin === row.bin ||
              i.path === row.path ||
              i.path === row.appDir)
        )
      ) {
        MessageError(t('nativeInUse'))
        return false
      }
      return true
    },
    install: async (row, progress) => {
      if (row.source !== 'Static') return adapter.command(row)
      const response = await forkTerminalRequest(
        'app-fork:mysql',
        ['installSoft', row],
        'MySQL installation timed out; inspect downloaded files',
        1_800_000,
        (info) => progress(info.msg)
      )
      if (response.code !== 0) throw new Error(response.msg || 'Installation failed')
    },
    remove: async (row) => {
      if (row.source !== 'Static') return adapter.command(row)
      const target = row.appDir || row.path
      if (!target) throw new Error('Cannot determine the package directory')
      await pluginRpc('removeStaticPackage', [target])
    },
    cancel: async () => adapter.terminal?.stop(),
    cleanup: () => adapter.cleanup(),
    notify: (type, message) => (type === 'success' ? MessageSuccess : MessageError)(t(message)),
    admission: (busy) => {
      installationAdmission.busy = busy
    }
  })
)
export const attachInstallationTerminal = (host?: HTMLElement) => adapter.attach(host)

function ownedDialog(component: any, props: any) {
  return waitForDialog(() => {
    const element = document.createElement('div')
    document.body.append(element)
    const app = VueExtend(component, props)
    try {
      const view = app.mount(element)
      return {
        view,
        dispose: () => {
          try {
            app.unmount()
          } finally {
            element.remove()
          }
        }
      }
    } catch (error) {
      element.remove()
      throw error
    }
  })
}

// Dialogs and host integration actions retain one module-lifetime owner too.
class InstallationActions {
  operations: Record<string, boolean> = {}
  private flights = new Map<string, Promise<unknown>>()
  run(key: string, task: () => Promise<unknown>): Promise<unknown> {
    const old = this.flights.get(key)
    if (old) return old
    this.operations[key] = true
    const result = Promise.resolve()
      .then(task)
      .catch((error) => {
        MessageError(String(error.message ?? error))
      })
      .finally(() => {
        delete this.operations[key]
        this.flights.delete(key)
      })
    this.flights.set(key, result)
    return result
  }
  open(path: string) {
    return this.run('open:' + path, async () => {
      const result: unknown = await shell.openPath(path)
      if (result !== true && result !== '')
        throw new Error(typeof result === 'string' ? result : 'Cannot open directory')
    })
  }
  copy(value: string) {
    return this.run('copy', () => clipboard.writeText(value))
  }
  environment(row: any) {
    return this.run('env:' + row.bin, () => ServiceActionStore.updatePath(row, 'mysql'))
  }
  aliases(row: any) {
    return this.run('alias:' + row.bin, async () => {
      const component = await import('@/components/ServiceManager/EXT/alias.vue')
      await ownedDialog(component.default, { item: row })
    })
  }
  refresh() {
    return this.run('refresh', refreshMysqlInstallations)
  }
  fetchEnvironment() {
    return this.run('environment-list', () => ServiceActionStore.fetchPath())
  }
  note(row: any, value: string) {
    return this.run('note:' + row.bin, async () => {
      await setInstalledVersionNote(row, value, 'mysql')
      row.note = value
    })
  }
  customDirectories() {
    return this.run('custom-dirs', async () => {
      const component = await import('@/components/ServiceManager/customPath.vue')
      await ownedDialog(component.default, { flag: 'mysql' })
      await refreshMysqlInstallations()
    })
  }
}
export const InstallationActionsManager = reactiveBind(new InstallationActions())
export { installedVersionNote, ServiceActionStore }
