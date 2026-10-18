import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import { openTerminal } from './launch'
import type { TerminalRequest } from '../shared'
import { validateDirectory } from './terminal'

class CommandShortcuts extends Base {
  constructor() {
    super()
    this.type = 'command-shortcuts'
  }

  openTerminal(request: TerminalRequest) {
    return new ForkPromise<boolean>(async (resolve, reject) => {
      try {
        await openTerminal(request)
        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  validateDirectory(path: string) {
    return new ForkPromise<string>(async (resolve, reject) => {
      try {
        resolve(await validateDirectory(path))
      } catch (error) {
        reject(error)
      }
    })
  }
}

export default new CommandShortcuts()
