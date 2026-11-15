import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { dialog, shell } from '@/util/NodeFn'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createConnectRequest } from './connect-request'
import { MemoryMaintenanceController } from './maintenance-controller'
import { MemoryManager } from './manager'
import { MemoryT as T } from './lang'
import { openMemoryDirectory } from './directory'
const request = createConnectRequest(IPC, 120_000)
export const MemoryMaintenance = reactiveBind(
  new MemoryMaintenanceController({
    id: () => crypto.randomUUID(),
    choose: async (kind) => {
      const result = await dialog.showOpenDialog({
        title: T(kind === 'backup' ? 'maintenanceChooseBackup' : 'maintenanceChooseRestore'),
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled ? undefined : result.filePaths[0]
    },
    confirmRestore: async () => {
      try {
        await ElMessageBox.confirm(T('maintenanceRestoreConfirm'), T('maintenanceRestore'), {
          confirmButtonText: T('maintenanceRestoreConfirmAction'),
          cancelButtonText: T('cancel'),
          type: 'warning',
          closeOnClickModal: false
        })
        return true
      } catch {
        return false
      }
    },
    maintain: (kind, path, id) =>
      request('app-fork:ai-memory', [kind === 'backup' ? 'backup' : 'restoreBackup', path, id]),
    status: (id) => request('app-fork:ai-memory', ['maintenanceResult', id]),
    inspect: () => request('app-fork:ai-memory', ['inspectRecovery']),
    projects: (fresh) => MemoryManager.loadProjects(fresh),
    selectedProjectPath: () => {
      const target = MemoryManager.preferredTarget
      return 'scope' in target && target.scope === 'project' ? target.project_path : undefined
    },
    chooseProject: async () => {
      const result = await dialog.showOpenDialog({
        title: T('projectChooseNewPath'),
        properties: ['openDirectory']
      })
      return result.canceled ? undefined : result.filePaths[0]
    },
    confirmRelink: async (project, path) => {
      try {
        await ElMessageBox.confirm(
          `${project.name}\n${project.project_path} → ${path}\n${T('projectRelinkConfirmHelp')}`,
          T('projectRelink'),
          {
            confirmButtonText: T('projectRelinkConfirmAction'),
            cancelButtonText: T('cancel'),
            closeOnClickModal: false
          }
        )
        return true
      } catch {
        return false
      }
    },
    relink: (input) => request('app-fork:ai-memory', ['relinkProject', input]),
    afterRelink: async (receipt) => {
      const result = await MemoryManager.applyProjectRelink(receipt)
      if (!result.success) throw new Error('project_relink_refresh_warning')
    },
    runtime: () => request('app-fork:ai-memory', ['runtimeInfo']),
    openPath: (path) => openMemoryDirectory(shell.openPath, path),
    afterRestore: async () => {
      MemoryManager.invalidateData()
    },
    notify: (type, key) => {
      ElMessage({ type, message: T(key) })
    }
  })
)
