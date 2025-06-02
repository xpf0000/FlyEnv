import { exec } from 'child_process'
import { promisify } from 'util'
import _fs from 'fs-extra'

const { mkdirp, remove, existsSync, readFile, writeFile } = _fs

export { mkdirp, remove, existsSync, readFile, writeFile }

const execAsync = promisify(exec)

export function waitTime(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, time)
  })
}

export function uuid(length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}

export async function dirChownFetch(dir: string) {
  const res = await execAsync(`ls -al "${dir}"`)

  const arr =
    res?.stdout
      ?.trim()
      ?.split('\n')?.[1]
      ?.split(' ')
      ?.filter((s: string) => !!s.trim()) ?? []
  return `${arr[2]}:${arr[3]}`
}
