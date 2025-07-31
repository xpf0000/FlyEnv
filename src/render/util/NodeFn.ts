import IPC from '@/util/IPC'
import { CustomerLangs } from '@lang/customer'
import { AppI18n } from '@lang/index'

// Helper function to create consistent IPC calls with proper typing
const createIPCCall = <T>(namespace: string, method: string) => {
  return (...args: any[]): Promise<T> =>
    new Promise((resolve) => {
      IPC.send(`App-Node-FN`, namespace, method, ...args).then((key: string, res: T) => {
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

type CustomerLangItem = {
  label: string
  key: string
  lang: any
}

export const lang = {
  initCustomerLang: createIPCCall<any>('lang', 'initCustomerLang'),
  loadCustomerLang: () => {
    return new Promise((resolve) => {
      createIPCCall<CustomerLangItem[]>('lang', 'loadCustomerLang')()
        .then((langArr) => {
          CustomerLangs.splice(0)
          for (const item of langArr) {
            CustomerLangs.push({
              label: item.label,
              lang: item.key
            })
            AppI18n().global.setLocaleMessage(item.key, item.lang)
          }
        })
        .catch()
        .finally(() => {
          resolve(true)
        })
    })
  }
}

export const ip = {
  address: createIPCCall<string>('ip', 'address')
}

export const clipboard = {
  writeText: createIPCCall<void>('clipboard', 'writeText')
}

export const md = {
  render: createIPCCall<string>('md', 'render')
}

export const nodeForge = {
  rsaGenerateKeyPair: createIPCCall<{ privateKey: string; publicKey: string }>(
    'node_forge',
    'rsaGenerateKeyPair'
  ),
  privateKeyToPem: createIPCCall<string>('node_forge', 'privateKeyToPem'),
  publicKeyToPem: createIPCCall<string>('node_forge', 'publicKeyToPem')
}

export const nativeTheme = {
  updateFn: [] as any,
  shouldUseDarkColors: createIPCCall<boolean>('nativeTheme', 'shouldUseDarkColors'),
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
  getPath: createIPCCall<string>('app', 'getPath'),
  getConfig: createIPCCall<any>('app', 'getConfig'),
  setLoginItemSettings: createIPCCall<string>('app', 'setLoginItemSettings'),
  getLoginItemSettings: createIPCCall<string>('app', 'getLoginItemSettings'),
  getVersion: createIPCCall<string>('app', 'getVersion')
}

export const dialog = {
  showSaveDialog: createIPCCall<Electron.SaveDialogReturnValue>('dialog', 'showSaveDialog'),
  showOpenDialog: createIPCCall<Electron.OpenDialogReturnValue>('dialog', 'showOpenDialog')
}

export const shell = {
  showItemInFolder: createIPCCall<void>('shell', 'showItemInFolder'),
  openPath: createIPCCall<string>('shell', 'openPath'),
  openExternal: createIPCCall<void>('shell', 'openExternal')
}

export const mime = {
  types: createIPCCall<any>('mime', 'types')
}

export const exec = {
  exec: createIPCCall<any>('exec', 'exec')
}

export const toml = {
  parse: createIPCCall<any>('toml', 'parse'),
  stringify: createIPCCall<string>('toml', 'stringify')
}

export const fs = {
  chmod: createIPCCall<void>('fs', 'chmod'),
  remove: createIPCCall<void>('fs', 'remove'),
  writeBufferBase64: createIPCCall<void>('fs', 'writeBufferBase64'),
  readdir: (dir: string, full = true): Promise<string[]> =>
    createIPCCall<string[]>('fs', 'readdir')(dir, full),
  mkdirp: createIPCCall<void>('fs', 'mkdirp'),
  stat: createIPCCall<import('fs').Stats>('fs', 'stat'),
  copy: createIPCCall<void>('fs', 'copy'),
  copyFile: createIPCCall<void>('fs', 'copyFile'),
  existsSync: createIPCCall<boolean>('fs', 'existsSync'),
  readFile: createIPCCall<string>('fs', 'readFile'),
  writeFile: createIPCCall<void>('fs', 'writeFile'),
  realpath: createIPCCall<string>('fs', 'realpath'),
  getFileHash: createIPCCall<string>('fs', 'getFileHash')
}
