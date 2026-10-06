import { spawnPromiseWithEnv } from '../../Fn'
import { portFromAddress } from '../../util/ListenPorts'

/** Native adaptation resolves imports, snippets, custom ports and JSON configurations. */
export async function caddyListenPorts(bin: string, config: string): Promise<number[]> {
  try {
    const result = await spawnPromiseWithEnv(bin, ['adapt', '--config', config], { timeout: 5000 })
    return portsFromCaddyConfig(JSON.parse(result.stdout))
  } catch {
    // Port discovery is supplementary. Actual startup still reports configuration failures.
    return []
  }
}

export function portsFromCaddyConfig(config: any): number[] {
  const http = config?.apps?.http
  const ports = new Set<number>()
  if (config?.admin?.listen && !config.admin.disabled) {
    const port = portFromAddress(config.admin.listen)
    if (port) ports.add(port)
  }
  for (const server of Object.values(http?.servers ?? {}) as any[]) {
    for (const address of server.listen ?? []) {
      const port = portFromAddress(address)
      if (port) ports.add(port)
      // Caddy may add the HTTP listener for automatic HTTPS after adaptation.
      if (
        (port === (http.https_port ?? 443) || server.tls_connection_policies?.length) &&
        !server.automatic_https?.disable &&
        !server.automatic_https?.disable_redirects
      )
        ports.add(http.http_port ?? 80)
    }
  }
  return [...ports]
}
