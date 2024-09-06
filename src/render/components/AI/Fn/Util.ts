import type BaseTask from '@/components/AI/Task/BaseTask'
import type { AllAppSofts } from '@/store/app'
import installedVersions from '@/util/InstalledVersions'
import { execPromiseRoot } from '@shared/Exec'

export function killPort(this: BaseTask, ports: Array<string>) {
  return new Promise(async (resolve) => {
    const pids: Set<string> = new Set()
    for (const port of ports) {
      let res: any = await execPromiseRoot(
        `lsof -nP -i:${port} | grep '(LISTEN)' | awk '{print $1,$2,$3,$9,$10}'`
      )
      res = res?.stdout ?? ''
      const arr: Array<string> = res
        .split('\n')
        .filter((p: string) => p.includes(`:${port} (LISTEN)`))
        .map((a: any) => {
          const list = a.split(' ').filter((s: string) => {
            return s.trim().length > 0
          })
          console.log('list: ', list)
          list.shift()
          return list.shift()
        })
      arr.forEach((a: string) => pids.add(a))
    }
    if (pids.size > 0) {
      try {
        await execPromiseRoot(['kill', '-9', ...Array.from(pids)])
      } catch (e) {}
    }
    resolve(true)
  })
}

export function killPid(this: BaseTask, pids: Array<string>) {
  return new Promise(async (resolve) => {
    try {
      await execPromiseRoot(['kill', '-9', ...pids])
    } catch (e) {}
    resolve(true)
  })
}

export function fetchInstalled(flags: Array<AllAppSofts>) {
  return new Promise(async (resolve) => {
    installedVersions.allInstalledVersions(flags).then(() => {
      resolve(true)
    })
  })
}

export function wordSplit(txt: string) {
  return new Promise((resolve) => {
    resolve(txt.split(''))
  })
}
