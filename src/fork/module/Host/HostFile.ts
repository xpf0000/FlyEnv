import { join } from 'path'
import type { AppHost } from '@shared/app'
import { existsSync } from 'fs'
import { readFile, writeFile } from '../../Fn'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const NodeRSA = require('node-rsa')

export const fetchHostList = async () => {
  const hostfile = join(global.Server.BaseDir!, 'host.json')
  let hostList: Array<AppHost> = []
  if (existsSync(hostfile)) {
    let content = (await readFile(hostfile, 'utf-8')).trim()
    if (content.length === 0) {
      return hostList
    }

    try {
      hostList = JSON.parse(content)
    } catch (e) {
      console.log(e)
      if (content.length > 0) {
        const hostBackFile = join(global.Server.BaseDir!, 'host.back.json')
        await writeFile(hostBackFile, content)
      }
      throw e
    }
  }
  return hostList
}

export const saveHostList = async (list: any) => {
  const hostfile = join(global.Server.BaseDir!, 'host.json')
  list.forEach((h: any) => {
    if (!h.type) {
      h.type = 'php'
    }
  })
  const content = JSON.stringify(list)
  await writeFile(hostfile, content)
}
