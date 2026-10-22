import { markRaw } from 'vue'
import { reactiveBind } from '@/util/Index'
import { BrewStore } from '@/store/brew'
import { AppStore } from '@/store/app'
import IPC from '@/util/IPC'
import { fetchVerion, brewInfo, portInfo } from '@/util/Brew'
import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { MessageError, MessageSuccess } from './notice'
import { shell, clipboard } from '@/util/NodeFn'
import { I18nT } from '@lang/index'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { installedVersionNote, setInstalledVersionNote } from '@/util/InstalledVersionNote'
import { VueExtend } from '@/core/VueExtend'
import { waitForDialog, type DialogView } from './dialog'
import { InstallationTerminal } from './terminal'
import XTerm from '@/util/XTerm'
import { findInstalledFormulaConflict } from '@/components/VersionManager/brew/FormulaConflict'
import {
  InstallationsController,
  requireStaticInstallationSuccess,
  type InstallationRow
} from './installationsController'
import { installationAdmission } from './admission'
import { beforeRemove } from './versionGuard'
import { MariadbClusterManager } from './manager'
import { t } from './lang'
import { waitForSharedBackup } from './backup'
import { waitForHomebrewDiscovery } from './environment'

const mariadb = () => BrewStore().module('mariadb')
export async function refreshMariadbInstallations() {
  const m = mariadb()
  m.installedFetched = false
  await m.fetchInstalled()
  if (!m.installedFetched) throw new Error('MariaDB installation refresh failed')
}
async function pluginRpc(method: string, args: any[]) {
  const response = await forkTerminalRequest(
    'app-fork:mariadb-cluster',
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
  session?: InstallationTerminal
  container?: HTMLDivElement
  host?: HTMLElement
  token = ''
  async command(row: InstallationRow) {
    const command = row.bootstrapHomebrew
      ? await pluginRpc('prepareHomebrewInstall', [AppStore().config.setup.lang])
      : await pluginRpc('preparePackageCommand', [row.source, row.name, row.installed])
    this.token = command.token
    if (InstallationManager.cancelled) throw new Error('Operation cancelled')
    this.container = markRaw(document.createElement('div'))
    this.container.style.height = '280px'
    this.attach(this.host)
    this.terminal = markRaw(new XTerm())
    const terminal = this.terminal
    this.session = new InstallationTerminal(terminal, () => {
      InstallationManager.output = terminal.logs.join('').slice(-40000)
    })
    await this.session.mount(this.container)
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
      this.container.style.height = '100%'
      host.append(this.container)
      this.terminal?.onWindowResit()
    } else {
      Object.assign(this.container.style, {
        position: 'fixed',
        left: '-10000px',
        width: '900px',
        height: '280px'
      })
      document.body.append(this.container)
    }
  }
  cancel() {
    return this.session?.stop()
  }
  async cleanup() {
    try {
      await this.session?.dispose()
    } finally {
      this.session = undefined
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
        ? fetchVerion('mariadb')
        : source === 'Homebrew'
          ? brewInfo('mariadb')
          : portInfo('mariadb'))
      return rows.map((row) => ({
        ...row,
        source,
        conflictingFormula:
          source === 'Homebrew' ? findInstalledFormulaConflict(row, rows) : undefined
      }))
    },
    installed: async () => {
      await refreshMariadbInstallations()
      await MariadbClusterManager.refresh()
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
        mariadb().installed.some(
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
      if (row.source !== 'Static') {
        await adapter.command(row)
        if (row.bootstrapHomebrew) {
          let request: ReturnType<typeof IPC.send> | undefined
          try {
            await waitForHomebrewDiscovery(
              () => window.Server.BrewCellar,
              () => InstallationManager.cancelled,
              () =>
                new Promise<void>((resolve) => {
                  request = IPC.send('app-check-brewport')
                  request.then((key: string) => {
                    IPC.off(key)
                    resolve()
                  })
                })
            )
          } finally {
            if (request) IPC.off(request.key)
          }
        }
        return
      }
      const response = await forkTerminalRequest(
        'app-fork:mariadb',
        ['installSoft', row],
        'MariaDB installation timed out; inspect downloaded files',
        1_800_000,
        (info) => progress(info.msg)
      )
      requireStaticInstallationSuccess(response)
    },
    remove: async (row) => {
      if (row.source !== 'Static') return adapter.command(row)
      const target = row.appDir || row.path
      if (!target) throw new Error('Cannot determine the package directory')
      await pluginRpc('removeStaticPackage', [target])
    },
    cancel: async () => adapter.cancel(),
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
      const view = app.mount(element) as unknown as DialogView
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
  openURL(url: string) {
    return this.run('url:' + url, () => shell.openExternal(url))
  }
  fetchCommand(row: InstallationRow) {
    const action = row.installed ? 'uninstall' : 'install'
    if (row.source === 'Homebrew') return `brew ${action} ${row.name}`
    if (row.source === 'Macports') {
      const names = `${row.name} ${row.name}-server`
      return `sudo port clean -v ${names}\nsudo port ${action} -v ${names}`
    }
    return row.url ?? ''
  }
  copyCommand(row: InstallationRow) {
    return this.run('copy-command', async () => {
      await clipboard.writeText(this.fetchCommand(row))
      MessageSuccess(I18nT('base.copySuccess'))
    })
  }
  manage(row: any) {
    return this.run('manage:' + row.bin, async () => {
      const { MySQLManage } = await import('@/components/Mysql/Manage/manage')
      MySQLManage.init('mariadb')
      const component = await import('./InstallationManage.vue')
      await ownedDialog(component.default, { item: row })
    })
  }
  managementDialog(row: any, kind: 'setPassword' | 'addDatabase' | 'setBackupDir') {
    return this.run(`manage-${kind}:${row.bin}`, async () => {
      const component = await {
        setPassword: () => import('@/components/Mysql/Manage/setPassword.vue'),
        addDatabase: () => import('@/components/Mysql/Manage/addDatabase.vue'),
        setBackupDir: () => import('@/components/Mysql/Manage/setBackupDir.vue')
      }[kind]()
      await ownedDialog(component.default, {
        item: row,
        ...(kind === 'setPassword' ? { user: 'root', showUpdateBtn: true, showResetBtn: true } : {})
      })
    })
  }
  refreshDatabases(row: any) {
    return this.run('manage-refresh:' + row.bin, async () => {
      const { MySQLManage } = await import('@/components/Mysql/Manage/manage')
      await MySQLManage.fetchDatabase(row)
    })
  }
  backupDatabases(row: any, names: string[]) {
    const snapshot = [...names]
    return this.run('manage-backup:' + row.bin, async () => {
      const { MySQLManage } = await import('@/components/Mysql/Manage/manage')
      await waitForSharedBackup(MySQLManage.backuping, row.bin, () =>
        MySQLManage.backupDatabase(row, snapshot)
      )
    })
  }
  removeService(row: any) {
    const setup = AppStore().config.setup
    const isCustom = setup.mariadb?.dirs?.some((directory: string) => row.bin.includes(directory))
    if (!row.isLocal7Z && !isCustom) {
      return InstallationManager.act({
        ...row,
        name: 'MariaDB ' + row.version,
        source: 'Static',
        installed: true
      })
    }
    return this.run('remove-service:' + row.bin, async () => {
      if (!(await beforeRemove(row))) return
      if (row.run || row.running) {
        MessageError(t('nativeInUse'))
        return
      }
      // The established owner hides a bundled/custom entry rather than deleting its directory.
      ServiceActionStore.delVersion(row, 'mariadb')
    })
  }
  environment(row: any) {
    return this.run('env:' + row.bin, () => ServiceActionStore.updatePath(row, 'mariadb'))
  }
  aliases(row: any) {
    return this.run('alias:' + row.bin, async () => {
      const component = await import('@/components/ServiceManager/EXT/alias.vue')
      await ownedDialog(component.default, { item: row })
    })
  }
  refresh() {
    return this.run('refresh', refreshMariadbInstallations)
  }
  fetchEnvironment() {
    return this.run('environment-list', () => ServiceActionStore.fetchPath())
  }
  note(row: any, value: string) {
    return this.run('note:' + row.bin, async () => {
      await setInstalledVersionNote(row, value, 'mariadb')
      row.note = value
    })
  }
  customDirectories() {
    return this.run('custom-dirs', async () => {
      const component = await import('@/components/ServiceManager/customPath.vue')
      await ownedDialog(component.default, { flag: 'mariadb' })
      await refreshMariadbInstallations()
    })
  }
}
export const InstallationActionsManager = reactiveBind(new InstallationActions())
export { installedVersionNote, ServiceActionStore }
