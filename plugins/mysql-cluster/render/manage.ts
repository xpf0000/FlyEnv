import { reactiveBind } from '@/util/Index'
import { clipboard, dialog, shell } from '@/util/NodeFn'
import { I18nT } from '@lang/index'
import { MysqlClusterManager as manager } from './manager'
import type { OperationResult } from '../shared'
import { errorText } from '../shared'

type Listing = {
  databases: { name: string; users: string[] }[]
  users: { User: string; Host: string }[]
}

export class MysqlManagementController {
  private directoryFlights = new Map<string, Promise<string | undefined>>()
  private flights = new Map<string, { action: string; promise: Promise<any> }>()
  actions: Record<string, string> = {}
  lists: Record<string, Listing> = {}

  busy(id: string) {
    return (
      !!this.actions[id] ||
      !!manager.operations[id]?.busy ||
      !!manager.operations[manager.groupFor(id)?.id ?? '']?.busy
    )
  }
  readOnly(id: string) {
    const group = manager.groupFor(id)
    return group?.mode === 'replication'
      ? group.memberIds[0] !== id
      : group?.mode === 'group-replication'
        ? manager.snapshots[id]?.replication?.role !== 'PRIMARY' ||
          manager.snapshots[id]?.replication?.state !== 'online'
        : false
  }
  private notice(type: 'success' | 'error', message: string) {
    try {
      manager.deps.notify(type, message)
    } catch {
      // A presentation failure cannot reverse a completed operation.
    }
  }
  private async supplementary(task: () => Promise<unknown>) {
    try {
      await task()
    } catch (error) {
      this.notice('error', errorText(error))
    }
  }
  private run<T>(id: string, action: string, task: () => Promise<T>): Promise<T | undefined> {
    const current = this.flights.get(id)
    if (current) return current.action === action ? current.promise : Promise.resolve(undefined)
    this.actions[id] = action
    const promise = Promise.resolve()
      .then(task)
      .catch((error) => {
        this.notice('error', errorText(error))
        return undefined
      })
      .finally(() => {
        delete this.actions[id]
        this.flights.delete(id)
      })
    this.flights.set(id, { action, promise })
    return promise
  }
  directoryBusy(id: string) {
    return this.directoryFlights.has(id)
  }
  chooseBackupDirectory(id: string): Promise<string | undefined> {
    const current = this.directoryFlights.get(id)
    if (current) return current
    const flight = Promise.resolve()
      .then(async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
        })
        if (result.canceled || !result.filePaths.length) return undefined
        const destination = result.filePaths[0]
        return (await this.savePreference(id, { backupDir: destination })) ? destination : undefined
      })
      .catch((error) => {
        this.notice('error', errorText(error))
        return undefined
      })
      .finally(() => this.directoryFlights.delete(id))
    this.directoryFlights.set(id, flight)
    return flight
  }
  private async savePreference(id: string, patch: Record<string, any>) {
    return (await manager.savePreferences(id, patch)).status === 'completed'
  }
  saveBackupDirectory(id: string, backupDir: string) {
    return this.run(id, 'backup-directory', () => this.savePreference(id, { backupDir }))
  }
  saveMark(id: string, database: string, mark: string) {
    return this.run(id, 'database-note', () =>
      this.savePreference(id, { marks: { ...manager.preferences[id]?.marks, [database]: mark } })
    )
  }
  async copy(value: string) {
    try {
      await clipboard.writeText(value)
      this.notice('success', I18nT('base.copySuccess'))
    } catch (error) {
      this.notice('error', errorText(error))
    }
  }
  private async fetch(id: string) {
    if (!manager.credentials[id]) return false
    const result = await manager.command<Listing>(id, 'getDatabasesWithUsers', [
      manager.credentials[id]
    ])
    if (result) this.lists[id] = result
    return !!result
  }
  refresh(id: string) {
    return this.run(id, 'refresh', () => this.fetch(id))
  }
  connect(id: string, password: string, remember: boolean) {
    return this.run(id, 'connect', async () => {
      if (!(await manager.setCredential(id, password, remember))) return false
      return this.fetch(id)
    })
  }
  add(id: string, data: { database: string; user: string; password: string; charset: string }) {
    const request = { ...data }
    return this.run(id, 'add-database', async () => {
      const result = await manager.command<{ userCreated: boolean }>(
        id,
        'addDatabase',
        [manager.credentials[id], request],
        true
      )
      if (!result) return false
      // SQL has completed. A local password save or list refresh must not invite replay.
      if (result.userCreated)
        await this.supplementary(() =>
          this.savePreference(id, {
            passwords: {
              ...manager.preferences[id]?.passwords,
              [request.user + '@localhost']: request.password
            }
          })
        )
      await this.supplementary(() => this.fetch(id))
      return true
    })
  }
  savePassword(id: string, user: string, host: string, password: string) {
    return this.run(id, 'save-password', async () => {
      const patch: Record<string, any> = {
        passwords: { ...manager.preferences[id]?.passwords, [`${user}@${host}`]: password }
      }
      if (user === 'root' && host === 'localhost') patch.rootCredential = { user, password }
      const saved = await this.savePreference(id, patch)
      if (saved && user === 'root' && host === 'localhost')
        manager.credentials[id] = { user, password }
      if (saved) this.notice('success', I18nT('base.success'))
      return saved
    })
  }
  confirmPassword(id: string, user: string, host: string, password: string) {
    return this.run(id, 'reset-password', async () => {
      const { ElMessageBox } = await import('element-plus')
      try {
        await ElMessageBox.confirm(I18nT('mysql.resetPasswordConfirm'), I18nT('host.warning'), {
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('base.cancel'),
          type: 'warning'
        })
      } catch {
        return false
      }
      return this.changePassword(id, user, host, password, true)
    })
  }
  password(id: string, user: string, host: string, password: string, remember: boolean) {
    return this.run(id, 'reset-password', () =>
      this.changePassword(id, user, host, password, remember)
    )
  }
  private async changePassword(
    id: string,
    user: string,
    host: string,
    password: string,
    remember: boolean
  ) {
    const result = await manager.command<boolean>(
      id,
      'passwordChange',
      [manager.credentials[id], user, host, password],
      true
    )
    if (!result) return false
    const group = manager.groupFor(id)
    const ids = group?.mode === 'standalone' ? [id] : (group?.memberIds ?? [id])
    for (const target of ids) {
      if (user === 'root' && host === 'localhost') manager.credentials[target] = { user, password }
      const passwords = { ...manager.preferences[target]?.passwords }
      if (remember) passwords[`${user}@${host}`] = password
      else delete passwords[`${user}@${host}`]
      const patch: Record<string, any> = { passwords }
      if (user === 'root' && host === 'localhost' && manager.preferences[target]?.rootCredential)
        patch.rootCredential = { user, password }
      await this.supplementary(() => this.savePreference(target, patch))
    }
    return true
  }
  backup(id: string, databases: string[]) {
    const selection = [...databases]
    return this.run(id, 'backup', async () => {
      if (!selection.length) return undefined
      let destination = manager.preferences[id]?.backupDir
      if (!destination) destination = await this.chooseBackupDirectory(id)
      if (!destination) return undefined
      const result = await manager.command<OperationResult>(
        id,
        'backupDatabase',
        [manager.credentials[id], selection, destination],
        true
      )
      if (result?.items.some((item) => item.status === 'completed')) {
        try {
          const error = await shell.openPath(destination)
          if (error) this.notice('error', String(error))
        } catch (error) {
          this.notice('error', errorText(error))
        }
      }
      return result
    })
  }
}
export const MysqlManagement = reactiveBind(new MysqlManagementController())
