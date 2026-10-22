import { reactiveBind } from '@/util/Index'
import { dialog, fs, shell } from '@/util/NodeFn'
import { dirname, join } from '@/util/path-browserify'
import { I18nT } from '@lang/index'
import { MariadbClusterManager as manager } from '../manager'
import { InstanceFilesController } from './controller'

export const InstanceFiles = reactiveBind(
  new InstanceFilesController({
    command: (id, method, args, write) => manager.command(id, method, args, write),
    notify: (type, text) => manager.deps.notify(type, text),
    exists: fs.existsSync,
    read: fs.readFileStrict,
    write: fs.writeFile,
    size: async (file) => (await fs.stat(file)).size,
    realpath: fs.realpath,
    dirname,
    join,
    open: shell.showItemInFolder,
    chooseOpen: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openFile', 'showHiddenFiles'] })
      return result.canceled ? undefined : result.filePaths[0]
    },
    chooseSave: async () => {
      const result = await dialog.showSaveDialog({
        properties: ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation'],
        defaultPath: 'mariadb-cluster-custom.cnf',
        filters: [{ name: 'Config File', extensions: ['cnf', 'ini', 'conf'] }]
      })
      return result.canceled ? undefined : result.filePath
    },
    success: () => I18nT('base.success'),
    tooBig: () => I18nT('base.fileBigErr')
  })
)
