import localForage from 'localforage'

export const StorageGet = (key: string) => {
  let saved: any = localStorage.getItem(key)
  if (saved) {
    saved = JSON.parse(saved)
    const time = Math.round(new Date().getTime() / 1000)
    if (time < saved.expire) {
      return saved.data
    }
  }
  return undefined
}

export const StorageSet = (key: string, obj: any, second: number) => {
  if (!obj) {
    return
  }
  localStorage.setItem(
    key,
    JSON.stringify({
      expire: Math.round(new Date().getTime() / 1000) + second,
      data: obj
    })
  )
}

export type StorageAsyncItem<T> = {
  expire?: number
  data: T
}

export const StorageGetAsync = async <T>(key: string): Promise<T> => {
  const saved = await localForage.getItem<StorageAsyncItem<T>>(key)
  if (saved?.expire) {
    const time = Math.round(new Date().getTime() / 1000)
    if (time < saved.expire) {
      return saved.data
    }
    throw new Error('expire')
  }
  throw new Error('no found')
}

export const StorageSetAsync = async (key: string, obj: any, second?: number) => {
  if (!obj) return
  await localForage.setItem(key, {
    expire: second ? Math.round(new Date().getTime() / 1000) + second : undefined,
    data: obj
  })
}
