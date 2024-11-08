import type BaseTask from '@web/components/AI/Task/BaseTask'
import type { AllAppModule } from '@web/core/type'
import { waitTime } from '@web/fn'

export function killPort(this: BaseTask, ports: Array<string>) {
  return new Promise(async (resolve) => {
    await waitTime()
    resolve(true)
  })
}

export function killPid(this: BaseTask, pids: Array<string>) {
  return new Promise(async (resolve) => {
    await waitTime()
    resolve(true)
  })
}

export function fetchInstalled(flags: Array<AllAppModule>) {
  return new Promise(async (resolve) => {
    await waitTime()
    resolve(true)
  })
}

export function wordSplit(txt: string) {
  return new Promise((resolve) => {
    resolve(txt.split(''))
  })
}
