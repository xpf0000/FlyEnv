import { exec } from 'child-process-promise'

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
  let res: any
  try {
    res = await exec(`ls -al "${dir}"`)
  } catch (e) {
    throw e
  }

  const arr =
    res?.stdout
      ?.trim()
      ?.split('\n')?.[1]
      ?.split(' ')
      ?.filter((s: string) => !!s.trim()) ?? []
  return `${arr[2]}:${arr[3]}`
}
