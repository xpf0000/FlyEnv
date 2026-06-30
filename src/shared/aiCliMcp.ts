export interface AIClientMcpRow {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

export function joinMcpCommand(command?: string, args?: string[]): string {
  return [command, ...(Array.isArray(args) ? args : [])].filter(Boolean).join(' ')
}

export function optionalBearerHeaders(token?: string): Record<string, string> | undefined {
  const trimmed = token?.trim() ?? ''
  return trimmed ? { Authorization: `Bearer ${trimmed}` } : undefined
}

export function isRemoteMcpType(type?: string): boolean {
  return ['http', 'https', 'sse', 'remote', 'streamable_http'].includes(type ?? '')
}
