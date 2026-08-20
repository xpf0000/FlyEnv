import IPC from '@/util/IPC'

let ready = false
let waiters: Array<() => void> = []
let retryInFlight: Promise<boolean> | undefined

const isReady = () => ready || window.Server.DataDirectoryReady === true

export const ensureDataDirectoryReady = async (): Promise<boolean> => {
  if (isReady()) {
    return true
  }
  if (!retryInFlight) {
    const request = new Promise<boolean>((resolve) => {
      IPC.send('application:data-directory-retry').then((key: string, response: any) => {
        IPC.off(key)
        const succeeded = response?.code === 0 && response.data === true
        if (succeeded) {
          window.Server.DataDirectoryReady = true
          markDataDirectoryReady()
        }
        resolve(succeeded)
      })
    })
    retryInFlight = request.finally(() => {
      retryInFlight = undefined
    })
  }
  return retryInFlight
}

export const waitForDataDirectoryReady = (): Promise<void> => {
  if (isReady()) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiters.push(resolve)
  })
}

export const markDataDirectoryReady = () => {
  if (ready) return
  ready = true
  const pending = waiters
  waiters = []
  pending.forEach((resolve) => resolve())
}
