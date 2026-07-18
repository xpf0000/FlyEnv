import IPC from '@/util/IPC'
import type { ExecOptions } from 'node:child_process'
import type { Stats } from 'node:fs'

// 创建类型工具
type IPCMethod<T extends any[], R> = (...args: T) => Promise<R>
type DialogProperties = string[]
type OpenDialogCompatOptions = Omit<Electron.OpenDialogOptions, 'properties'> & {
  properties?: DialogProperties
}
type SaveDialogCompatOptions = Omit<Electron.SaveDialogOptions, 'properties'> & {
  properties?: DialogProperties
}

// 工厂函数
const createIPCCall = <T extends any[], R>(namespace: string, method: string): IPCMethod<T, R> => {
  return (...args: T): Promise<R> =>
    new Promise((resolve) => {
      IPC.send(`App-Node-FN`, namespace, method, ...args).then((key: string, res: R) => {
        IPC.off(key)
        resolve(res)
      })
    })
}

export class FileWatcher {
  constructor(
    public file: string,
    callback: () => void
  ) {
    IPC.send(`App-Node-FN`, 'fs', 'watchFile', file).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
      } else if (res.code === 200) {
        callback()
      }
    })
  }

  close(): void {
    IPC.send(`App-Node-FN`, 'fs', 'watchFileClose', this.file).then((key: string) => {
      IPC.off(key)
    })
  }
}

export class DirWatcher {
  constructor(
    public dir: string,
    callback: (file: string) => void
  ) {
    IPC.send(`App-Node-FN`, 'fs', 'watchDir', dir).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
      } else if (res.code === 200) {
        callback(res.file)
      }
    })
  }

  close(): void {
    IPC.send(`App-Node-FN`, 'fs', 'watchDirClose', this.dir).then((key: string) => {
      IPC.off(key)
    })
  }
}

type CustomLocaleMetadata = { locale: string; label: string }
type LanguageResponse<T> = { code: number; data?: T; msg?: string }

const languageRequest = <T>(command: string, ...args: unknown[]) =>
  new Promise<T>((resolve, reject) => {
    IPC.send(command, ...args).then((key: string, response: LanguageResponse<T>) => {
      IPC.off(key)
      if (response?.code === 0 && response.data !== undefined) resolve(response.data)
      else reject(new Error(response?.msg || `Language request failed: ${command}`))
    })
  })

export const lang = {
  listCustom: () =>
    languageRequest<CustomLocaleMetadata[]>('application:language-list-custom'),
  invalidate: (locale: string) =>
    languageRequest<boolean>('application:language-invalidate', locale),
  initCustom: (locale: 'en' | 'zh') =>
    languageRequest<string>('application:language-init-custom', locale)
}

export interface NetworkInterfaceInfo {
  name: string
  ip: string
  isVirtual: boolean
  priority: number
}

export const ip = {
  address: createIPCCall<[], string>('ip', 'address'),
  addressList: createIPCCall<[], NetworkInterfaceInfo[]>('ip', 'address_list')
}

export const clipboard = {
  writeText: createIPCCall<[string], void>('clipboard', 'writeText')
}

export const md = {
  render: createIPCCall<[string], string>('md', 'render')
}

export const nodeForge = {
  rsaGenerateKeyPair: createIPCCall<[{ bits: number }], { privateKey: string; publicKey: string }>(
    'node_forge',
    'rsaGenerateKeyPair'
  ),
  privateKeyToPem: createIPCCall<[string], string>('node_forge', 'privateKeyToPem'),
  publicKeyToPem: createIPCCall<[string], string>('node_forge', 'publicKeyToPem')
}

export const nativeTheme = {
  updateFn: [] as any,
  shouldUseDarkColors: createIPCCall<[], boolean>('nativeTheme', 'shouldUseDarkColors'),
  on(flag: 'updated', _fn: () => void) {
    if (flag === 'updated' && !this.updateFn.includes(_fn)) {
      this.updateFn.push(_fn)
    }
  },
  removeListener(flag: 'updated', _fn: () => void) {
    if (flag === 'updated' && this.updateFn.includes(_fn)) {
      const index = this.updateFn.indexOf(_fn)
      if (index >= 0) {
        this.updateFn.splice(index, 1)
      }
    }
  }
}

export const app = {
  getPath: createIPCCall<
    [
      | 'home'
      | 'appData'
      | 'userData'
      | 'sessionData'
      | 'temp'
      | 'exe'
      | 'module'
      | 'desktop'
      | 'documents'
      | 'downloads'
      | 'music'
      | 'pictures'
      | 'videos'
      | 'recent'
      | 'logs'
      | 'crashDumps'
    ],
    string
  >('app', 'getPath'),
  getConfig: createIPCCall<[], any>('app', 'getConfig'),
  setLoginItemSettings: createIPCCall<[{ openAtLogin?: boolean }], string>(
    'app',
    'setLoginItemSettings'
  ),
  getLoginItemSettings: createIPCCall<[], string>('app', 'getLoginItemSettings'),
  getVersion: createIPCCall<[], string>('app', 'getVersion')
}

export const dialog = {
  showSaveDialog: createIPCCall<[SaveDialogCompatOptions], Electron.SaveDialogReturnValue>(
    'dialog',
    'showSaveDialog'
  ),
  showOpenDialog: createIPCCall<[OpenDialogCompatOptions], Electron.OpenDialogReturnValue>(
    'dialog',
    'showOpenDialog'
  ),
  showMessageBox: createIPCCall<[Electron.MessageBoxOptions], Electron.MessageBoxReturnValue>(
    'dialog',
    'showMessageBox'
  )
}

export const shell = {
  showItemInFolder: createIPCCall<[string], void>('shell', 'showItemInFolder'),
  openPath: createIPCCall<[string], string>('shell', 'openPath'),
  openExternal: createIPCCall<[string], void>('shell', 'openExternal')
}

export const mime = {
  types: createIPCCall<[], any>('mime', 'types')
}

export const exec = {
  exec: createIPCCall<
    [
      command: string,
      options?: {
        encoding: 'buffer' | null
      } & ExecOptions
    ],
    any
  >('exec', 'exec')
}

export const toml = {
  parse: createIPCCall<[string], any>('toml', 'parse'),
  stringify: createIPCCall<any, string>('toml', 'stringify')
}

export const fs = {
  chmod: createIPCCall<[path: string, mode: string | number], void>('fs', 'chmod'),
  remove: createIPCCall<[path: string], void>('fs', 'remove'),
  writeBufferBase64: createIPCCall<[path: string, data: string], void>('fs', 'writeBufferBase64'),
  readdir: createIPCCall<[dir: string, full?: boolean], string[]>('fs', 'readdir'),
  subdir: createIPCCall<[dir: string], string[]>('fs', 'subdir'),
  mkdirp: createIPCCall<[dir: string], void>('fs', 'mkdirp'),
  stat: createIPCCall<[path: string], Stats>('fs', 'stat'),
  copy: createIPCCall<[src: string, dest: string], void>('fs', 'copy'),
  copyFile: createIPCCall<[src: string, dest: string], void>('fs', 'copyFile'),
  existsSync: createIPCCall<[string], boolean>('fs', 'existsSync'),
  access: createIPCCall<[path: string, mode?: 'r' | 'w' | 'rw'], boolean>('fs', 'access'),
  readFile: createIPCCall<[path: string], string>('fs', 'readFile'),
  writeFile: createIPCCall<[path: string, data: string], void>('fs', 'writeFile'),
  realpath: createIPCCall<[path: string], string>('fs', 'realpath'),
  getFileHash: createIPCCall<
    [string, 'sha1' | 'sha256' | 'md5' | 'sha512' | 'sha512Base64'],
    string
  >('fs', 'getFileHash')
}
