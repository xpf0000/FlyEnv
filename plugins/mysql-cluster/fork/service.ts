import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { ProcessListByExactPid } from '@shared/Process'
import { readFile } from 'node:fs/promises'
import type { SoftInstalled } from '@shared/app'
import type { InstanceSpec } from '../shared'
import type { InstanceCatalog } from './catalog'
import { selectInstanceRoots } from './processIdentity'

export class InstanceStopAdapter extends Base {
  constructor(private readonly catalog: InstanceCatalog, private readonly spec: InstanceSpec) {
    super(); this.type = 'mysql'; this.pidPath = catalog.paths(spec.id).pid
  }
  protected appPidFile() { return this.pidPath }
  _stopServer(_version: SoftInstalled) {
    return new ForkPromise<any>(async (resolve, reject) => {
      try {
        const list = await StopProcessListFetch()
        const roots = selectInstanceRoots(list, this.catalog.paths(this.spec.id).config, this.catalog.platform === 'Windows')
        let recorded = ''
        try { recorded = (await readFile(this.pidPath, 'utf8')).trim() }
        catch (error: any) { if (error.code !== 'ENOENT') throw error }
        if (!roots.length && recorded && list.some(p => p.PID === recorded && !p.COMMAND?.trim())) throw new Error('Cannot verify instance PID identity')
        const pids = [...new Set(roots.flatMap(p => ProcessListByExactPid(p.PID, list).map(row => row.PID)))]
        let finalList = list
        if (pids.length) finalList = this.catalog.platform === 'Windows'
          ? await this.stopWindowsServiceProcesses(pids, list)
          : await this.stopUnixServicePids('-TERM', roots.map(p => p.PID), pids, 15_000, list)
        await this.cleanupStoppedServicePidFiles([...pids, recorded].filter(Boolean), finalList, [this.pidPath])
        resolve({ 'APP-Service-Stop-PID': pids })
      } catch (error) { reject(error) }
    })
  }
}
