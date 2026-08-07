import { ref } from 'vue'
import type { SoftInstalled } from '@/store/brew'
import { BrewStore } from '@/store/brew'
import { MessageError } from '@/util/Element'
import { shell } from '@/util/NodeFn'
import IPC from '@/util/IPC'

/** Owns the Neo4j Browser action; service lifecycle stays in ModuleInstalledItem. */
export class Neo4jController {
  readonly opening = ref(false)

  async openBrowser(item?: SoftInstalled, port = 7474) {
    if (this.opening.value) return false
    const running =
      item ??
      BrewStore()
        .module('neo4j')
        .installed.find((version) => version.run)
    if (!running) {
      MessageError('Neo4j is not running')
      return false
    }
    this.opening.value = true
    try {
      const response = await this.invoke('portinfo', JSON.parse(JSON.stringify(running)))
      const browserPort =
        Number(response?.data?.http ?? (running as any).neo4jHttpPort ?? port) || 7474
      await shell.openExternal(`http://127.0.0.1:${browserPort}`)
      return true
    } finally {
      this.opening.value = false
    }
  }

  private invoke(method: string, ...args: any[]) {
    return new Promise<any>((resolve) => {
      IPC.sendSensitive('app-fork:neo4j', method, ...args).then((key: string, res: any) => {
        if (res?.code === 200) return
        IPC.off(key)
        resolve(res ?? { code: 1, msg: 'Neo4j operation failed' })
      })
    })
  }
}

export default new Neo4jController()
