import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { clipboard } from '@/util/NodeFn'
import { ElMessage } from 'element-plus'
import { AppI18n } from '@lang/index'
import { configureMCPClient } from '@/components/MCP/clientConfig'
import { MCPSetup } from '@/components/MCP/setup'
import {
  buildHttpClientConfigSnippet,
  buildStdioClientConfigSnippet,
  getMcpServerUrl
} from '@shared/mcpClientConfig'
import { MemoryConnectController } from './connect-controller'
import { createConnectRequest } from './connect-request'
import { MEMORY_CONNECT_TOOLS, prepareMemoryService } from './connect-service'
import { memoryRules } from './manager'
import { MemoryT } from './lang'
const request = createConnectRequest(IPC)
export const MemoryConnectManager = reactiveBind(
  new MemoryConnectController({
    prepareService: async () => {
      const result = await prepareMemoryService(request)
      if (MCPSetup) {
        MCPSetup.running = true
        MCPSetup.config.transport.http = true
        MCPSetup.config.enabledTools = [
          ...new Set([...MCPSetup.config.enabledTools, ...MEMORY_CONNECT_TOOLS])
        ]
      }
      return result
    },
    readSettings: async () => {
      const config = await request('mcp:getConfig')
      if (!Number.isInteger(config?.port) || typeof config?.token !== 'string')
        throw new Error('config_unavailable')
      return { serverUrl: getMcpServerUrl(config), token: config.token }
    },
    readStatus: async () => {
      const [config, status] = await Promise.all([request('mcp:getConfig'), request('mcp:status')])
      return (
        status?.running === true &&
        config?.transport?.http === true &&
        MEMORY_CONNECT_TOOLS.every((name) => config?.enabledTools?.includes(name))
      )
    },
    configure: configureMCPClient,
    installRules: async (client, projectPath) => {
      const locale = `${AppI18n().global.locale ?? 'en'}`.startsWith('zh') ? 'zh' : 'en'
      const result = await request('app-fork:ai-memory', [
        'installRules',
        client,
        locale,
        ...(projectPath === undefined ? [] : [projectPath])
      ])
      if (result?.outcome !== 'success' || typeof result.data?.path !== 'string')
        throw new Error(result?.error_code ?? 'rules_unavailable')
      return result.data
    },
    snippet: async (transport, settings) => {
      if (transport === 'http')
        return buildHttpClientConfigSnippet('claudeCode', settings.serverUrl, settings.token)
      const path = await request<string>('mcp:getBridgePath')
      if (!path) throw new Error('bridge_unavailable')
      return buildStdioClientConfigSnippet(path, settings.serverUrl, settings.token)
    },
    copy: (text) => clipboard.writeText(text),
    rules: memoryRules,
    notify: (type, key) => {
      ElMessage({ type, message: MemoryT(key) })
    }
  })
)
