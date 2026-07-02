type MCPConfigReader = {
  getConfig: (key?: string, defaultValue?: any) => any
}

type MCPRuntimeController<T = any> = {
  start: () => Promise<T>
  stop: () => Promise<T>
}

export async function startMcpOnLaunchIfNeeded(
  mcpConfigManager: MCPConfigReader,
  mcpServer: Pick<MCPRuntimeController, 'start'>,
  onError: (error: unknown) => void = (error) => {
    console.log('mcp auto-start error: ', error)
  }
) {
  const autoStart = !!mcpConfigManager.getConfig('autoStart', false)
  if (!autoStart) {
    return false
  }
  try {
    await mcpServer.start()
    return true
  } catch (error) {
    onError(error)
    return false
  }
}

export function startMcpRuntime<T = any>(mcpServer: Pick<MCPRuntimeController<T>, 'start'>) {
  return mcpServer.start()
}

export function stopMcpRuntime<T = any>(mcpServer: Pick<MCPRuntimeController<T>, 'stop'>) {
  return mcpServer.stop()
}
