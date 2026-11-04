import { errorText } from '../../shared'

export type FileView = 'config' | 'errorLog' | 'slowLog'
export type InstanceFiles = { config: string; errorLog: string; slowLog: string; root: string }
export type FileState = {
  busy: boolean
  loaded: boolean
  file: string
  text: string
  saved: string
  revision: number
  defaultFile: string
}
export type FileDependencies = {
  command<T>(id: string, method: string, args: unknown[], write?: boolean): Promise<T | undefined>
  notify(type: 'error' | 'success', text: string): void
  exists(file: string): Promise<boolean>
  read(file: string): Promise<string>
  write(file: string, text: string): Promise<void>
  size(file: string): Promise<number>
  realpath(file: string): Promise<string>
  dirname(file: string): string
  join(dir: string, file: string): string
  open(file: string): Promise<unknown>
  chooseOpen(): Promise<string | undefined>
  chooseSave(): Promise<string | undefined>
  success(): string
  tooBig(): string
}

// File requests and native dialogs survive the drawer; drafts and editor models do not.
export class InstanceFilesController {
  states: Record<string, FileState> = {}
  private flights = new Map<string, Promise<void>>()
  private paths: Record<string, InstanceFiles> = {}
  constructor(readonly deps: FileDependencies) {}
  state(id: string, view: FileView): FileState {
    const key = `${id}:${view}`
    this.states[key] ??= {
      busy: false,
      loaded: false,
      file: '',
      text: '',
      saved: '',
      revision: 0,
      defaultFile: ''
    }
    return this.states[key]
  }
  private notice(type: 'error' | 'success', message: string) {
    try {
      this.deps.notify(type, message)
    } catch {
      // A notification cannot change a completed file operation.
    }
  }
  private run(id: string, view: FileView, task: (state: FileState) => Promise<void>) {
    const key = `${id}:${view}`
    const existing = this.flights.get(key)
    if (existing) return existing
    const state = this.state(id, view)
    state.busy = true
    const flight = Promise.resolve()
      .then(() => task(state))
      .catch((error) => this.notice('error', errorText(error)))
      .finally(() => {
        state.busy = false
        this.flights.delete(key)
      })
    this.flights.set(key, flight)
    return flight
  }
  load(id: string, view: FileView) {
    return this.run(id, view, async (state) => {
      state.loaded = false
      state.defaultFile = ''
      const paths = await this.deps.command<InstanceFiles>(id, 'instanceFiles', [])
      if (!paths) return
      this.paths[id] = paths
      state.file = paths[view]
      if (view === 'config') {
        const text = await this.deps.command<string>(id, 'readConfig', [])
        if (text === undefined) return
        state.text = state.saved = text
        state.revision++
        state.defaultFile = ''
        // Default availability is supplementary; a failed check cannot discard the read.
        try {
          if (await this.deps.exists(`${paths.config}.default`))
            state.defaultFile = `${paths.config}.default`
        } catch (error) {
          this.notice('error', errorText(error))
        }
      }
      state.loaded = true
    })
  }
  save(id: string, text: string) {
    return this.run(id, 'config', async (state) => {
      if (!state.loaded || text === state.saved) return
      if (!(await this.deps.command<boolean>(id, 'saveConfig', [text], true))) return
      state.text = state.saved = text
      state.revision++
    })
  }
  open(id: string) {
    return this.run(id, 'config', async (state) => {
      if (state.file) await this.deps.open(state.file)
    })
  }
  loadDefault(id: string) {
    return this.run(id, 'config', async (state) => {
      if (!state.defaultFile) return
      state.text = await this.deps.read(state.defaultFile)
      state.revision++
    })
  }
  loadCustom(id: string) {
    return this.run(id, 'config', async (state) => {
      const file = await this.deps.chooseOpen()
      if (!file) return
      if ((await this.deps.size(file)) > 5 * 1024 * 1024) throw new Error(this.deps.tooBig())
      state.text = await this.deps.read(file)
      state.revision++
    })
  }
  saveCustom(id: string, text: string) {
    return this.run(id, 'config', async () => {
      const paths = this.paths[id]
      if (!paths) return
      const file = await this.deps.chooseSave()
      if (!file) return
      const root = await this.deps.realpath(paths.root)
      const destination = (await this.deps.exists(file))
        ? await this.deps.realpath(file)
        : this.deps.join(
            await this.deps.realpath(this.deps.dirname(file)),
            file.split(/[\\/]/).pop()!
          )
      const normalize = (path: string) => path.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
      const normalizedRoot = normalize(root)
      const normalizedDestination = normalize(destination)
      // Custom exports must never become an alternate write path into managed instance files.
      if (
        normalizedDestination === normalizedRoot ||
        normalizedDestination.startsWith(`${normalizedRoot}/`)
      )
        throw new Error('Choose an export location outside the managed MySQL Cluster directory')
      await this.deps.write(file, text)
      this.notice('success', this.deps.success())
    })
  }
}
