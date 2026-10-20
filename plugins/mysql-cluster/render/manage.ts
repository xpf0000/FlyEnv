import { reactiveBind } from '@/util/Index'
import { dialog, shell } from '@/util/NodeFn'
import { MysqlClusterManager as manager } from './manager'
import type { OperationResult } from '../shared'
import { errorText } from '../shared'

export class MysqlManagementController {
  private directoryFlights = new Map<string, Promise<string | undefined>>()
  directoryBusy(id: string) {
    return this.directoryFlights.has(id)
  }
  chooseBackupDirectory(id: string): Promise<string | undefined> {
    const current = this.directoryFlights.get(id)
    if (current) return current
    const flight = Promise.resolve()
      .then(async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory']
        })
        if (result.canceled || !result.filePaths.length) return undefined
        const destination = result.filePaths[0]
        await manager.savePreferences(id, { backupDir: destination })
        return destination
      })
      .catch((error) => {
        manager.deps.notify('error', errorText(error))
        return undefined
      })
      .finally(() => this.directoryFlights.delete(id))
    this.directoryFlights.set(id, flight)
    return flight
  }
  lists: Record<
    string,
    { databases: { name: string; users: string[] }[]; users: { User: string; Host: string }[] }
  > = {}
  async refresh(id: string) {
    if (!manager.credentials[id]) return false
    const result = await manager.command<any>(id, 'getDatabasesWithUsers', [
      manager.credentials[id]
    ])
    if (result) this.lists[id] = result
    return !!result
  }
  async add(
    id: string,
    data: { database: string; user: string; password: string; charset: string }
  ) {
    const result = await manager.command<any>(
      id,
      'addDatabase',
      [manager.credentials[id], data],
      true
    )
    if (!result) return false
    if (result.userCreated) {
      const passwords = {
        ...(manager.preferences[id]?.passwords ?? {}),
        [data.user + '@localhost']: data.password
      }
      await manager.savePreferences(id, { passwords })
    }
    await this.refresh(id)
    return true
  }
  async password(id: string, user: string, host: string, password: string, remember: boolean) {
    const result = await manager.command<boolean>(
      id,
      'passwordChange',
      [manager.credentials[id], user, host, password],
      true
    )
    if (!result) return false
    // Account changes replicate; refresh session credentials for every known affected member.
    const group = manager.groupFor(id),
      ids = group?.mode === 'standalone' ? [id] : (group?.memberIds ?? [id])
    for (const target of ids) {
      if (user === 'root' && host === 'localhost') manager.credentials[target] = { user, password }
      const passwords = { ...(manager.preferences[target]?.passwords ?? {}) }
      if (remember) passwords[`${user}@${host}`] = password
      else delete passwords[`${user}@${host}`]
      const patch: Record<string, any> = { passwords }
      if (user === 'root' && host === 'localhost' && manager.preferences[target]?.rootCredential)
        patch.rootCredential = { user, password }
      await manager.savePreferences(target, patch)
    }
    return true
  }
  async backup(id: string, databases: string[]) {
    if (!databases.length) return
    let destination = manager.preferences[id]?.backupDir
    if (!destination) {
      destination = await this.chooseBackupDirectory(id)
      if (!destination) return
    }
    const result = await manager.command<OperationResult>(
      id,
      'backupDatabase',
      [manager.credentials[id], databases, destination],
      true
    )
    if (result?.items.some((item) => item.status === 'completed')) {
      try {
        await shell.openPath(destination)
      } catch {
        /* Export results remain valid. */
      }
    }
    return result
  }
}
export const MysqlManagement = reactiveBind(new MysqlManagementController())
