import { parse } from '@ltd/j-toml'
import { readFile } from '../../Fn'
import { portFromAddress } from '../../util/ListenPorts'

export async function numaListenPorts(configFile: string): Promise<number[]> {
  try {
    const config: any = parse(await readFile(configFile, 'utf8'), { bigint: false })
    const ports = new Set<number>()
    const add = (value: unknown) => {
      if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535)
        ports.add(value)
    }
    // Match NUMA's serde defaults, including listeners started in background tasks.
    for (const address of [config.server?.bind_addr ?? '0.0.0.0:53'].flat()) {
      if (typeof address === 'string') add(portFromAddress(address, 53))
    }
    add(config.server?.api_port ?? 5380)
    if (config.proxy?.enabled !== false) {
      add(config.proxy?.port ?? 80)
      add(config.proxy?.tls_port ?? 443)
    }
    if (config.dot?.enabled !== false) add(config.dot?.port ?? 853)
    if (config.mobile?.enabled === true) add(config.mobile.port ?? 8765)
    return [...ports]
  } catch {
    // Discovery is supplementary; actual startup owns configuration errors.
    return []
  }
}
