import { address } from 'neoip'
import { BrowserWindow, clipboard, nativeTheme, app, dialog, shell } from 'electron'
import { createRequire } from 'node:module'
import ConfigManager from './ConfigManager'
import { exec } from 'node:child_process'
import { type FSWatcher, rm, chmod, stat, existsSync, watch, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import Helper from '../../fork/Helper'
import { resolve } from 'path'
import ZH from '@lang/zh'
import EN from '@lang/en'
import { AppAllLang, AppI18n } from '@lang/index'
import { createMarkdownRenderer } from '@/util/markdown/markdown'
import { isLinux, isMacOS, pathFixedToUnix } from '@shared/utils'
import { realpath } from '@shared/fs-extra'
import { parse as TOMLParse, stringify as TOMLStringify } from '@iarna/toml'
import { copy, mkdirp, writeFile, readFile } from '@shared/fs-extra'
import crypto from 'node:crypto'

const require = createRequire(import.meta.url)

const { pki } = require('node-forge')

async function readdirRecursive(dir: string): Promise<string[]> {
  const items = await readdir(dir, { withFileTypes: true })
  const results = []
  for (const item of items) {
    const fullPath = pathFixedToUnix(join(dir, item.name))
    if (item.isDirectory()) {
      results.push(...(await readdirRecursive(fullPath))) // 递归子文件夹
    } else {
      results.push(fullPath) // 记录文件路径
    }
  }
  return results
}

type WatcherItem = {
  watcher: FSWatcher
  command: string
  key: string
}

type CustomerLangItem = {
  label: string
  key: string
  lang: any
}

type AppPathFlag =
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

export class AppNodeFn {
  mainWindow?: BrowserWindow
  trayWindow?: BrowserWindow
  configManager?: ConfigManager
  customerLang: Record<string, any> = {}
  private fileWatchers: Map<string, WatcherItem> = new Map()
  private dirWatchers: Map<string, WatcherItem> = new Map()

  ip_address(command: string, key: string) {
    const ip = address() ?? ''
    this?.mainWindow?.webContents.send('command', command, key, ip)
  }

  clipboard_writeText(command: string, key: string, txt: string) {
    clipboard.writeText(txt)
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  node_forge_rsaGenerateKeyPair(command: string, key: string, opt: any) {
    console.log('node_forge_rsaGenerateKeyPair: ', opt)
    pki.rsa.generateKeyPair(
      { ...opt, workers: 4 },
      (err: any, keyPair: { privateKey: string; publicKey: string }) => {
        console.log('generateRawPairs: ', opt, err, keyPair)
        if (err) {
          this?.mainWindow?.webContents.send('command', command, key, undefined)
          return
        }
        const keys = {
          privateKey: pki.privateKeyToPem(keyPair.privateKey),
          publicKey: pki.publicKeyToPem(keyPair.publicKey)
        }
        this?.mainWindow?.webContents.send('command', command, key, keys)
      }
    )
  }

  node_forge_privateKeyToPem(command: string, key: string, txt: string) {
    const pem = pki.privateKeyToPem(txt)
    this?.mainWindow?.webContents.send('command', command, key, pem)
  }

  node_forge_publicKeyToPem(command: string, key: string, txt: string) {
    const pem = pki.publicKeyToPem(txt)
    this?.mainWindow?.webContents.send('command', command, key, pem)
  }

  nativeTheme_shouldUseDarkColors(command: string, key: string) {
    const isDark = nativeTheme.shouldUseDarkColors
    console.log('nativeTheme_shouldUseDarkColors: ', command, key, isDark)
    this?.mainWindow?.webContents.send('command', command, key, isDark)
    this?.trayWindow?.webContents.send('command', command, key, isDark)
  }

  nativeTheme_watch() {
    nativeTheme.on('updated', () => {
      this?.mainWindow?.webContents.send(
        'command',
        'App-Native-Theme-Update',
        'App-Native-Theme-Update',
        true
      )
      this?.trayWindow?.webContents.send(
        'command',
        'App-Native-Theme-Update',
        'App-Native-Theme-Update',
        true
      )
    })
  }

  toml_parse(command: string, key: string, json: any) {
    const res = TOMLParse(json)
    this?.mainWindow?.webContents.send('command', command, key, res)
  }

  toml_stringify(command: string, key: string, json: any) {
    const res = TOMLStringify(json)
    this?.mainWindow?.webContents.send('command', command, key, res)
  }

  app_getPath(command: string, key: string, flag: AppPathFlag) {
    const res = app.getPath(flag)
    this?.mainWindow?.webContents.send('command', command, key, res)
  }

  app_getConfig(command: string, key: string) {
    const config = this?.configManager?.getConfig()
    console.log('this?.mainWindow?.webContents: ', this)
    this?.mainWindow?.webContents?.send('command', command, key, config)
  }

  app_setLoginItemSettings(command: string, key: string, param: any) {
    app.setLoginItemSettings(param)
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  app_getLoginItemSettings(command: string, key: string) {
    const res = app.getLoginItemSettings()
    this?.mainWindow?.webContents.send('command', command, key, res)
  }

  app_getVersion(command: string, key: string) {
    const version = app.getVersion()
    this?.mainWindow?.webContents.send('command', command, key, version)
  }

  dialog_showSaveDialog(command: string, key: string, options: Electron.SaveDialogOptions) {
    dialog.showSaveDialog(this.mainWindow!, options).then((result) => {
      this?.mainWindow?.webContents.send('command', command, key, result)
    })
  }

  dialog_showOpenDialog(command: string, key: string, options: Electron.OpenDialogOptions) {
    dialog.showOpenDialog(this.mainWindow!, options).then((result) => {
      this?.mainWindow?.webContents.send('command', command, key, result)
    })
  }

  shell_showItemInFolder(command: string, key: string, fullPath: string) {
    shell.showItemInFolder(fullPath)
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  shell_openPath(command: string, key: string, path: string) {
    shell.openPath(path).then().catch()
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  shell_openExternal(command: string, key: string, url: string) {
    shell.openExternal(url).then().catch()
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  exec_exec(command: string, key: string, cmd: string, opt: any) {
    exec(cmd, opt, (error, stdout, stderr) => {
      this?.mainWindow?.webContents.send('command', command, key, {
        error,
        stdout,
        stderr
      })
    })
  }

  fs_chmod(command: string, key: string, path: string, mode: string | number) {
    chmod(path, mode, (err) => {
      this?.mainWindow?.webContents.send('command', command, key, !err)
    })
  }

  fs_remove(command: string, key: string, path: string) {
    rm(path, { recursive: true, force: true }, (err) => {
      this?.mainWindow?.webContents.send('command', command, key, !err)
    })
  }

  fs_writeBufferBase64(command: string, key: string, path: string, data: string) {
    const buffer = Buffer.from(data, 'base64')
    writeFile(path, buffer)
      .then(() => {
        this?.mainWindow?.webContents.send('command', command, key, true)
      })
      .catch(() => {
        if (isMacOS() || isLinux()) {
          Helper.send('tools', 'writeFileByRoot', path, data)
            .then(() => {
              this?.mainWindow?.webContents.send('command', command, key, true)
            })
            .catch(() => {
              this?.mainWindow?.webContents.send('command', command, key, false)
            })
        } else {
          this?.mainWindow?.webContents.send('command', command, key, false)
        }
      })
  }

  fs_readdir(command: string, key: string, dir: string, full: boolean) {
    if (!existsSync(dir)) {
      this?.mainWindow?.webContents.send('command', command, key, [])
      return
    }
    readdirRecursive(dir).then((arr) => {
      if (full) {
        this?.mainWindow?.webContents.send('command', command, key, arr)
        return
      }
      const result = arr.map((file) => {
        return file.replace(`${pathFixedToUnix(dir)}/`, '')
      })
      this?.mainWindow?.webContents.send('command', command, key, result)
    })
  }

  fs_mkdirp(command: string, key: string, dir: string) {
    mkdirp(dir)
      .then(() => {
        this?.mainWindow?.webContents.send('command', command, key, true)
      })
      .catch(() => {
        this?.mainWindow?.webContents.send('command', command, key, false)
      })
  }

  fs_stat(command: string, key: string, path: string) {
    stat(path, (err, stats) => {
      const obj: any = JSON.parse(JSON.stringify(stats))
      obj.isDirectory = stats.isDirectory()
      obj.isFile = stats.isFile()
      obj.isSymbolicLink = stats.isSymbolicLink()
      obj.isSocket = stats.isSocket()
      this?.mainWindow?.webContents.send('command', command, key, err ? null : obj)
    })
  }

  fs_copy(command: string, key: string, src: string, dest: string) {
    copy(src, dest)
      .then(() => {
        this?.mainWindow?.webContents.send('command', command, key, true)
      })
      .catch(() => {
        this?.mainWindow?.webContents.send('command', command, key, false)
      })
  }

  fs_existsSync(command: string, key: string, path: string) {
    const exists = existsSync(path)
    this?.mainWindow?.webContents.send('command', command, key, exists)
  }

  fs_realpath(command: string, key: string, path: string) {
    realpath(path)
      .then((p) => {
        this?.mainWindow?.webContents.send('command', command, key, p)
      })
      .catch(() => {
        this?.mainWindow?.webContents.send('command', command, key, path)
      })
  }

  fs_readFile(command: string, key: string, path: string) {
    path = pathFixedToUnix(path)
    readFile(path, 'utf-8')
      .then((data: string) => {
        this?.mainWindow?.webContents.send('command', command, key, data)
      })
      .catch(() => {
        if (isMacOS() || isLinux()) {
          Helper.send('tools', 'readFileByRoot', path)
            .then((data) => {
              this?.mainWindow?.webContents.send('command', command, key, data)
            })
            .catch(() => {
              this?.mainWindow?.webContents.send('command', command, key, '')
            })
        } else {
          this?.mainWindow?.webContents.send('command', command, key, '')
        }
      })
  }

  fs_writeFile(command: string, key: string, path: string, data: string) {
    writeFile(path, data)
      .then(() => {
        this?.mainWindow?.webContents.send('command', command, key, true)
      })
      .catch(() => {
        if (isMacOS() || isLinux()) {
          Helper.send('tools', 'writeFileByRoot', path, data)
            .then(() => {
              this?.mainWindow?.webContents.send('command', command, key, true)
            })
            .catch(() => {
              this?.mainWindow?.webContents.send('command', command, key, false)
            })
        } else {
          this?.mainWindow?.webContents.send('command', command, key, false)
        }
      })
  }

  fs_watchFile(command: string, key: string, filePath: string) {
    const watcher = watch(filePath, (eventType) => {
      console.log('fs_watchFile on watch: ', filePath, eventType)
      if (eventType === 'change') {
        this?.mainWindow?.webContents.send('command', command, key, {
          code: 200
        })
      }
    })

    this.fileWatchers.set(filePath, {
      watcher,
      command,
      key
    })
  }

  fs_watchFileClose(command: string, key: string, filePath: string) {
    const watcher = this.fileWatchers.get(filePath)
    if (watcher) {
      watcher.watcher.close()
      this?.mainWindow?.webContents.send('command', watcher.command, watcher.key, {
        code: 0
      })
      this.fileWatchers.delete(filePath)
    }
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  fs_watchDir(command: string, key: string, dirPath: string) {
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (filename && (eventType === 'rename' || eventType === 'change')) {
        const fullPath = join(dirPath, filename)
        this?.mainWindow?.webContents.send('command', command, key, { code: 200, file: fullPath })
      }
    })

    this.dirWatchers.set(dirPath, {
      watcher,
      command,
      key
    })
  }

  fs_watchDirClose(command: string, key: string, dirPath: string) {
    const watcher = this.dirWatchers.get(dirPath)
    if (watcher) {
      watcher.watcher.close()
      this?.mainWindow?.webContents.send('command', watcher.command, watcher.key, { code: 0 })
      this.dirWatchers.delete(dirPath)
    }
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  fs_getFileHash(
    command: string,
    key: string,
    file: string,
    algorithm: 'sha1' | 'sha256' | 'md5' = 'sha256'
  ) {
    const hash = crypto.createHash(algorithm)
    const stream = createReadStream(file)

    stream.on('error', () => {
      this?.mainWindow?.webContents.send('command', command, key, '')
    })

    stream.on('data', (chunk: any) => {
      hash.update(chunk)
    })

    stream.on('end', () => {
      const md5 = hash.digest('hex')
      this?.mainWindow?.webContents.send('command', command, key, md5)
    })
  }

  md_render(command: string, key: string, content: string) {
    createMarkdownRenderer()
      .then((res) => {
        const html = res.render(content)
        this?.mainWindow?.webContents.send('command', command, key, html)
      })
      .catch(() => {
        this?.mainWindow?.webContents.send('command', command, key, '')
      })
  }

  async lang_initCustomerLang(command: string, key: string) {
    const langDir = resolve(global.Server.BaseDir!, '../lang')
    await mkdirp(langDir)
    const currentLang = global.Server.Lang!
    await mkdirp(join(langDir, currentLang))
    const lang: any = currentLang === 'zh' ? ZH.zh : EN.en
    for (const k in lang) {
      const v: any = lang[k]
      const f = join(langDir, currentLang, `${k}.json`)
      if (!existsSync(f)) {
        await writeFile(f, JSON.stringify(v, null, 2))
      }
    }
    const indexJson =
      currentLang === 'zh'
        ? {
            lang: 'zh',
            label: '中文'
          }
        : {
            lang: 'en',
            label: 'English'
          }
    const file = join(langDir, currentLang, `index.json`)
    await writeFile(file, JSON.stringify(indexJson, null, 2))
    this?.mainWindow?.webContents.send('command', command, key, true)
  }

  async lang_loadCustomerLang(command: string, key: string) {
    const langDir = resolve(global.Server.BaseDir!, '../lang')
    if (!existsSync(langDir)) {
      return
    }
    const dir = await readdir(langDir)
    if (!dir.length) {
      return
    }
    const langArr: CustomerLangItem[] = []
    for (const d of dir) {
      const f = join(langDir, d, 'index.json')
      if (!existsSync(f)) {
        continue
      }
      const content = await readFile(f, 'utf-8')
      let json: any
      try {
        json = JSON.parse(content)
      } catch {}
      if (!json) {
        continue
      }
      if (!json?.lang || !json?.label) {
        continue
      }
      if (Object.keys(AppAllLang).includes(json.lang)) {
        continue
      }
      const files = await readdir(join(langDir, d))
      const langFiles = files.filter((f: string) => f.endsWith('.json') && f !== 'index.json')
      if (!langFiles.length) {
        continue
      }
      const item: CustomerLangItem = {
        label: json.label,
        key: json.lang,
        lang: {}
      }
      const lang = item.lang
      for (const f of langFiles) {
        const content = await readFile(join(langDir, d, f), 'utf-8')
        let json: any
        try {
          json = JSON.parse(content)
        } catch {}
        if (!json) {
          continue
        }
        const key = f.replace('.json', '')
        lang[key] = json
      }
      if (!Object.keys(lang).length) {
        continue
      }
      langArr.push(item)
    }
    console.log('langArr: ', langArr)
    this?.mainWindow?.webContents.send('command', command, key, langArr)

    for (const item of langArr) {
      this.customerLang[item.key] = item.lang
      AppI18n().global.setLocaleMessage(item.key, item.lang)
    }
  }
}

export default new AppNodeFn()
