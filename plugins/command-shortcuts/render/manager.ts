import { ElMessage } from 'element-plus'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { CommandShortcutsController } from './controller'
import { ShortcutsT } from './lang'
import { shell } from '@/util/NodeFn'
import { openDirectoryPath } from './path'

const storageKey = 'flyenv-plugin-command-shortcuts-v1'

export const CommandShortcutsManager = reactiveBind(
  new CommandShortcutsController({
    read: () => StorageGetAsync(storageKey),
    write: (value) => StorageSetAsync(storageKey, value),
    id: () => crypto.randomUUID(),
    openPath: (path) =>
      openDirectoryPath(
        path,
        async (directory) => {
          const response = await forkTerminalRequest(
            'app-fork:command-shortcuts',
            ['validateDirectory', directory],
            ShortcutsT('pathOpenFailed'),
            60_000
          )
          if (response.code !== 0) throw new Error(response.msg || ShortcutsT('invalidDirectory'))
        },
        (directory) => shell.openPath(directory)
      ),
    notify: (type, message) => {
      ElMessage({ type, message: ShortcutsT(message) })
    },
    launch: async (request) => {
      const response = await forkTerminalRequest(
        'app-fork:command-shortcuts',
        ['openTerminal', request],
        ShortcutsT('launchUnknown'),
        60_000
      )
      if (response.code !== 0) throw new Error(response.msg || ShortcutsT('launchFailed'))
    }
  })
)
