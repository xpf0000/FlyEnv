import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { readFile } from '../../Fn'

export async function tomcatListenPorts(baseDir: string): Promise<number[]> {
  try {
    const content = await readFile(join(baseDir, 'conf/server.xml'), 'utf8')
    const server = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(
      content
    )?.Server
    const offset = Number(server?.portOffset ?? 0)
    if (!Number.isInteger(offset) || offset < 0) return []
    const ports = new Set<number>()
    const add = (value: unknown) => {
      const port = Number(value)
      if (Number.isInteger(port) && port > 0 && port + offset <= 65535) ports.add(port + offset)
    }
    add(server?.port)
    const services = server?.Service ? [server.Service].flat() : []
    for (const service of services) {
      for (const connector of service.Connector ? [service.Connector].flat() : []) {
        add(connector.port)
      }
    }
    return [...ports]
  } catch {
    // Discovery is supplementary; actual startup owns configuration errors.
    return []
  }
}
