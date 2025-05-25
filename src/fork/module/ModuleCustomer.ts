import { join } from 'path'
import { Base } from './Base'
import { serviceStartExec, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import Helper from '../Helper'
import { existsSync } from 'fs'
import { mkdirp, writeFile } from 'fs-extra'
import { ProcessPidsByPid } from '@shared/Process'

type ModuleExecItem = {
  id: string
  name: string
  comment: string
  command: string
  commandFile: string
  commandType: 'command' | 'file'
  isSudo?: boolean
  pidPath?: string
}

class ModuleCustomer extends Base {
  constructor() {
    super()
  }

  stopService(pid: string) {
    return new ForkPromise(async (resolve) => {
      const allPid: string[] = []
      const plist: any = await Helper.send('tools', 'processList')
      const pids = ProcessPidsByPid(pid.trim(), plist)
      allPid.push(...pids)
      const arr: string[] = Array.from(new Set(allPid))
      if (arr.length > 0) {
        let sig = '-TERM'
        try {
          await Helper.send('tools', 'kill', sig, arr)
        } catch (e) {}
        await waitTime(500)
        sig = '-INT'
        try {
          await Helper.send('tools', 'kill', sig, arr)
        } catch (e) {}
      }
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }
  startService(version: ModuleExecItem) {
    return new ForkPromise(async (resolve, reject) => {
      if (version.commandType === 'file' && !existsSync(version.commandFile)) {
        reject(new Error('Command File Not Exists'))
        return
      }

      const on = () => {}

      let bin = ''
      const baseDir = join(global.Server.BaseDir!, 'module-customer')
      await mkdirp(baseDir)
      const execEnv = ``
      const execArgs = ``

      if (version.commandType === 'file') {
        bin = version.commandFile
        try {
          await Helper.send('tools', 'chmod', bin, '0777')
        } catch (e) {}
      } else {
        bin = join(baseDir, `${version.id}.start.sh`)
        await writeFile(bin, version.command)
      }

      try {
        const res = await serviceStartExec(
          {
            version: '1.0',
            typeFlag: ''
          },
          version?.pidPath ?? '',
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          20,
          500,
          !!version?.pidPath
        )
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }
}
export default new ModuleCustomer()
