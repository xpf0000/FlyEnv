import type BaseTask from '@/components/AI/Task/BaseTask'
import IPC from '@/util/IPC'

export function killPort(this: BaseTask, ports: Array<string>) {
  return new Promise((resolve) => {
    IPC.send(`app-fork:tools`, 'killPorts', ports).then((key: string) => {
      IPC.off(key)
      resolve(true)
    })
  })
}

export function killPid(this: BaseTask, pids: Array<string>) {
  return new Promise((resolve) => {
    IPC.send(`app-fork:tools`, 'killPids', '-9', pids).then((key: string) => {
      IPC.off(key)
      resolve(true)
    })
  })
}

export function wordSplit(txt: string) {
  return new Promise((resolve) => {
    resolve(txt.split(''))
  })
}
