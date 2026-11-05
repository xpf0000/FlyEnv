import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { clipboard, dialog, fs, shell } from '@/util/NodeFn'
import { ElMessage } from 'element-plus'
import { AppI18n } from '@lang/index'
import { getMcpServerUrl } from '@shared/mcpClientConfig'
import { configureMCPClient } from '@/components/MCP/clientConfig'
import rulesEn from '../assets/memory-rules.md?raw'
import rulesZh from '../assets/memory-rules.zh.md?raw'
import { MemoryController } from './controller'
import { MemoryT } from './lang'

export const memoryRules = () =>
  `${AppI18n().global.locale ?? 'en'}`.startsWith('zh') ? rulesZh : rulesEn
function readMCPConfig(): Promise<any> {
  return new Promise((resolve, reject) => {
    const call = IPC.sendSensitive('mcp:getConfig')
    const timer = setTimeout(() => {
      IPC.off(call.key)
      reject(new Error('config_unavailable'))
    }, 30_000)
    call.then((key: string, response: any) => {
      if (response?.code === 200) return
      clearTimeout(timer)
      IPC.off(key)
      if (response?.code === 0) resolve(response.data)
      else reject(new Error('config_unavailable'))
    })
  })
}
export const MemoryManager = reactiveBind(
  new MemoryController({
    ipc: IPC,
    id: () => crypto.randomUUID(),
    readPreferences: () => StorageGetAsync('flyenv-plugin-ai-memory-v1'),
    writePreferences: (value) => StorageSetAsync('flyenv-plugin-ai-memory-v1', value),
    configure: async (client) => {
      const config = await readMCPConfig()
      return configureMCPClient(client, { serverUrl: getMcpServerUrl(config), token: config.token })
    },
    copyRules: () => clipboard.writeText(memoryRules()),
    downloadRules: async () => {
      const choice = await dialog.showSaveDialog({
        defaultPath: 'flyenv-memory-rules.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (choice.canceled || !choice.filePath) return false
      await fs.writeFile(choice.filePath, memoryRules())
      return true
    },
    openPath: async (path) => {
      const error = await shell.openPath(path)
      if (error) throw new Error('directory_unavailable')
    },
    notify: (type, key) => {
      ElMessage({ type, message: MemoryT(key) })
    }
  })
)
