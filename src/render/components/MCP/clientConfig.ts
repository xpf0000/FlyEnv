import IPC from '@/util/IPC'
import type { MCPHttpClientFlag } from '@shared/mcpClientConfig'

export type ClientConfigResult = { success: boolean; errorCode?: string }
export function configureMCPClient(
  client: MCPHttpClientFlag,
  config: { serverUrl: string; token: string }
): Promise<ClientConfigResult> {
  const type = client === 'openCode' ? 'remote' : 'http'
  return new Promise((resolve) => {
    let done = false
    let key = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: ClientConfigResult) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      if (key) IPC.off(key)
      resolve(result)
    }
    try {
      const request = IPC.sendSensitive(
        `app-fork:${client}`,
        'addMcp',
        'flyenv',
        type,
        config.serverUrl,
        config.token
      )
      key = request.key
      timer = setTimeout(
        () => finish({ success: false, errorCode: 'client_config_unknown' }),
        60_000
      )
      request.then((_key: string, response: any) => {
        if (response?.code === 200) return
        finish(
          response?.code === 0
            ? { success: true }
            : { success: false, errorCode: 'client_config_failed' }
        )
      })
    } catch {
      finish({ success: false, errorCode: 'client_config_unknown' })
    }
  })
}
