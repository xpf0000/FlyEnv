import { errorText, readCatalog } from '../shared'
import type { CommandFolder, PresetCommand, SavedCatalog, TerminalRequest } from '../shared'

export interface ControllerDependencies {
  read(): Promise<unknown>
  write(value: SavedCatalog): Promise<void>
  launch(request: TerminalRequest): Promise<void>
  openPath(path: string): Promise<void>
  notify(type: 'success' | 'error', message: string): void
  id(): string
}

export interface TerminalOperation {
  request: TerminalRequest
  status: 'opening' | 'opened' | 'failed'
  error?: string
}

export class CommandShortcutsController {
  folders: CommandFolder[] = []
  initialized = false
  loading = false
  saving = false
  loadError = ''
  operations: Record<string, TerminalOperation> = {}
  pathOperations: Record<
    string,
    { path: string; status: 'opening' | 'opened' | 'failed'; error?: string }
  > = {}
  private loadPromise?: Promise<boolean>

  constructor(private readonly deps: ControllerDependencies) {}

  private notice(type: 'success' | 'error', message: string) {
    // A notification failure must not change a completed save or terminal handoff.
    try {
      this.deps.notify(type, message)
    } catch (error) {
      console.warn(error)
    }
  }

  load(): Promise<boolean> {
    if (this.initialized) return Promise.resolve(true)
    if (this.loadPromise) return this.loadPromise
    this.loading = true
    this.loadError = ''
    this.loadPromise = Promise.resolve().then(async () => {
      try {
        let value: unknown
        try {
          value = await this.deps.read()
        } catch (error) {
          if (!['no found', 'expire'].includes(errorText(error))) throw error
          value = { version: 1, folders: [] }
        }
        this.folders = readCatalog(value)
        this.initialized = true
        return true
      } catch (error) {
        this.loadError = errorText(error)
        return false
      } finally {
        this.loading = false
        this.loadPromise = undefined
      }
    })
    return this.loadPromise
  }

  private async change(update: (folders: CommandFolder[]) => void): Promise<boolean> {
    if (!this.initialized || this.saving) return false
    this.saving = true
    try {
      const folders: CommandFolder[] = JSON.parse(JSON.stringify(this.folders))
      update(folders)
      const value: SavedCatalog = { version: 1, folders }
      readCatalog(value)
      await this.deps.write(value)
      this.folders = folders
      return true
    } catch (error) {
      this.notice('error', errorText(error))
      return false
    } finally {
      this.saving = false
    }
  }

  saveFolder(input: Pick<CommandFolder, 'name' | 'path'>, id?: string) {
    const snapshot = { name: input.name.trim(), path: input.path }
    return this.change((folders) => {
      if (id) Object.assign(this.folder(folders, id), snapshot)
      else folders.push({ ...snapshot, id: this.deps.id(), commands: [] })
    })
  }

  saveCommand(
    folderId: string,
    input: Pick<PresetCommand, 'description' | 'command'>,
    id?: string
  ) {
    const snapshot = { description: input.description.trim(), command: input.command }
    return this.change((folders) => {
      const folder = this.folder(folders, folderId)
      if (id) {
        const command = folder.commands.find((item) => item.id === id)
        if (!command) throw new Error('itemMissing')
        Object.assign(command, snapshot)
      } else folder.commands.push({ ...snapshot, id: this.deps.id() })
    })
  }

  removeFolder(id: string) {
    return this.change((folders) => {
      const folder = this.folder(folders, id)
      folders.splice(folders.indexOf(folder), 1)
    })
  }

  removeCommand(folderId: string, commandId: string) {
    return this.change((folders) => {
      const folder = this.folder(folders, folderId)
      const index = folder.commands.findIndex((item) => item.id === commandId)
      if (index < 0) throw new Error('itemMissing')
      folder.commands.splice(index, 1)
    })
  }

  private folder(folders: CommandFolder[], id: string): CommandFolder {
    const folder = folders.find((item) => item.id === id)
    if (!folder) throw new Error('itemMissing')
    return folder
  }

  reorderFolders(ids: string[]): Promise<boolean> {
    if (!this.initialized || this.saving) return Promise.resolve(false)
    if (
      ids.length === this.folders.length &&
      ids.every((id, index) => id === this.folders[index].id)
    )
      return Promise.resolve(true)
    const order = [...ids]
    return this.change((folders) => {
      folders.splice(0, folders.length, ...this.ordered(folders, order))
    })
  }

  reorderCommands(folderId: string, ids: string[]): Promise<boolean> {
    if (!this.initialized || this.saving) return Promise.resolve(false)
    const current = this.folders.find((folder) => folder.id === folderId)?.commands
    if (
      current &&
      ids.length === current.length &&
      ids.every((id, index) => id === current[index].id)
    )
      return Promise.resolve(true)
    const order = [...ids]
    return this.change((folders) => {
      const commands = this.folder(folders, folderId).commands
      commands.splice(0, commands.length, ...this.ordered(commands, order))
    })
  }

  private ordered<T extends { id: string }>(items: T[], ids: string[]): T[] {
    const byId = new Map(items.map((item) => [item.id, item]))
    if (
      ids.length !== items.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !byId.has(id))
    )
      throw new Error('invalidOrder')
    return ids.map((id) => byId.get(id)!)
  }

  isOpening(commandId: string): boolean {
    return this.operations[commandId]?.status === 'opening'
  }

  async run(folderId: string, commandId: string): Promise<boolean> {
    if (this.isOpening(commandId) || !this.initialized) return false
    try {
      const folder = this.folder(this.folders, folderId)
      const command = folder.commands.find((item) => item.id === commandId)
      if (!command) throw new Error('itemMissing')
      return this.launch(commandId, { path: folder.path, command: command.command })
    } catch (error) {
      this.notice('error', errorText(error))
      return false
    }
  }

  async openFolderTerminal(folderId: string): Promise<boolean> {
    if (!this.initialized || this.isOpening(folderId)) return false
    try {
      const folder = this.folder(this.folders, folderId)
      return this.launch(folderId, { path: folder.path })
    } catch (error) {
      this.notice('error', errorText(error))
      return false
    }
  }

  private async launch(key: string, request: TerminalRequest): Promise<boolean> {
    this.operations[key] = { request: { ...request }, status: 'opening' }
    try {
      await this.deps.launch({ ...request })
      this.operations[key].status = 'opened'
      this.notice(
        'success',
        request.command === undefined ? 'directoryTerminalOpened' : 'terminalOpened'
      )
      return true
    } catch (error) {
      this.operations[key].status = 'failed'
      this.operations[key].error = errorText(error)
      this.notice('error', errorText(error))
      return false
    }
  }

  isOpeningPath(folderId: string): boolean {
    return this.pathOperations[folderId]?.status === 'opening'
  }

  async openFolderPath(folderId: string): Promise<boolean> {
    if (!this.initialized || this.isOpeningPath(folderId)) return false
    try {
      const { path } = this.folder(this.folders, folderId)
      this.pathOperations[folderId] = { path, status: 'opening' }
      await this.deps.openPath(path)
      this.pathOperations[folderId].status = 'opened'
      return true
    } catch (error) {
      if (this.pathOperations[folderId]) {
        this.pathOperations[folderId].status = 'failed'
        this.pathOperations[folderId].error = errorText(error)
      }
      this.notice('error', errorText(error))
      return false
    }
  }
}
