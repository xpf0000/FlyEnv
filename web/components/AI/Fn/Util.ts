import type BaseTask from '@web/components/AI/Task/BaseTask'
import { waitTime } from '@web/fn'

export function execPromise(): Promise<{
  stdout: string
  stderr: string
}> {
  return new Promise(async (resolve) => {
    await waitTime()
    resolve({
      stdout: '',
      stderr: ''
    })
  })
}

export function killPort(this: BaseTask) {
  return new Promise(async (resolve) => {
    await waitTime()
    resolve(true)
  })
}

export function killPid(this: BaseTask) {
  return new Promise(async (resolve) => {
    await waitTime()
    resolve(true)
  })
}

export function fetchInstalled() {
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
