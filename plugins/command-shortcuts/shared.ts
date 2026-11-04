export interface PresetCommand {
  id: string
  description: string
  command: string
}

export interface CommandFolder {
  id: string
  name: string
  path: string
  commands: PresetCommand[]
}

export interface TerminalRequest {
  path: string
  command?: string
}

export interface SavedCatalog {
  version: 1
  folders: CommandFolder[]
}

export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function readCatalog(value: unknown): CommandFolder[] {
  const saved = value as SavedCatalog
  if (saved?.version !== 1 || !Array.isArray(saved.folders)) throw new Error('invalidCatalog')
  const ids = new Set<string>()
  const unique = (id: unknown) => {
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('invalidCatalog')
    ids.add(id)
  }
  for (const folder of saved.folders) {
    unique(folder?.id)
    if (
      !folder ||
      typeof folder.name !== 'string' ||
      !folder.name.trim() ||
      typeof folder.path !== 'string' ||
      !folder.path.trim() ||
      folder.path.includes('\0') ||
      !Array.isArray(folder.commands)
    )
      throw new Error('invalidCatalog')
    for (const command of folder.commands) {
      unique(command?.id)
      if (
        !command ||
        typeof command.description !== 'string' ||
        !command.description.trim() ||
        typeof command.command !== 'string' ||
        !command.command.trim() ||
        command.command.includes('\0')
      )
        throw new Error('invalidCatalog')
    }
  }
  return saved.folders.map(({ id, name, path, commands }) => ({
    id,
    name,
    path,
    commands: JSON.parse(JSON.stringify(commands))
  }))
}
