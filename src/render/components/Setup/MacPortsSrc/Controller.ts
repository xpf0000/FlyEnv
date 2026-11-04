import IPC from '@/util/IPC'
import XTerm from '@/util/XTerm'
import { reactiveBind, uuid } from '@/util/Index'
import { fs } from '@/util/NodeFn'
import { basename, join } from '@/util/path-browserify'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { sourceApplyCommand, sourceApplyOutcomes, type FileOutcome } from './TerminalApply'

type Source = { url: string; rsync_server: string; rsync_dir: string }
type Preview = { directory: string; files: { path: string; snapshot: string; content: string }[] }

class MacPortsSourceController {
  running = false
  preview?: Preview
  outcomes: FileOutcome[] = []
  xterm?: XTerm

  async prepare(source: Source) {
    if (this.running) return
    this.running = true
    let directory: string | undefined
    try {
      const previous = this.preview
      const result = await new Promise<{ files: { path: string; content: string }[] }>(
        (resolve, reject) => {
          const sent = IPC.send('app-fork:macports', 'changSrc', { ...source })
          const timer = setTimeout(() => {
            IPC.off(sent.key)
            reject(new Error(I18nT('base.fail')))
          }, 30_000)
          sent.then((key: string, result: any) => {
            if (result?.code === 200) return
            clearTimeout(timer)
            IPC.off(key)
            if (result?.code === 0) resolve(result.data)
            else reject(new Error(result?.msg ?? I18nT('base.fail')))
          })
        }
      )
      // The fork creates no files, so an abandoned IPC response leaves no snapshots.
      directory = join(window.Server.Cache!, `macports-source-${uuid()}`)
      await fs.mkdirp(directory)
      const files = result.files.map((file) => ({
        ...file,
        snapshot: join(directory!, basename(file.path))
      }))
      for (const file of files) await fs.writeFile(file.snapshot, file.content)
      this.xterm?.destroy()
      this.xterm = undefined
      this.preview = { directory, files }
      this.outcomes = []
      directory = undefined
      if (previous) await fs.remove(previous.directory).catch(() => {})
    } catch (error) {
      if (directory) await fs.remove(directory).catch(() => {})
      MessageError(String(error))
    } finally {
      this.running = false
    }
  }

  async apply(element: HTMLElement) {
    if (this.running || !this.preview) return
    this.running = true
    const snapshot = this.preview
    const resultFile = snapshot.directory + '/apply-results.txt'
    let failure: unknown
    this.outcomes = sourceApplyOutcomes(snapshot.files, '')
    try {
      this.xterm?.destroy()
      const terminal = new XTerm()
      this.xterm = terminal
      await terminal.mount(element)
      await terminal.send([sourceApplyCommand(snapshot.files, resultFile)], true, true)
    } catch (error) {
      failure = error
    }
    try {
      this.outcomes = sourceApplyOutcomes(snapshot.files, await fs.readFileStrict(resultFile))
    } catch (error) {
      failure ??= error
    }
    if (!failure && this.outcomes.every((result) => result.status === 'completed')) {
      MessageSuccess(I18nT('base.success'))
      await fs.remove(snapshot.directory).catch(() => {})
      this.preview = undefined
    } else {
      MessageError(String(failure ?? I18nT('base.fail')))
    }
    // Keep logs/outcomes for re-entry and inspection after a partial or unknown result.
    this.xterm?.unmounted()
    this.running = false
  }

  detach() {
    this.xterm?.unmounted()
  }
}

export default reactiveBind(new MacPortsSourceController())
