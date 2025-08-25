import { address } from 'neoip'
import { BrowserWindow, clipboard, nativeTheme, app, dialog, shell } from 'electron'
import { createRequire } from 'node:module'
import ConfigManager from './ConfigManager'
import { execPromise } from '@shared/child-process'
import { type FSWatcher, rm, stat, existsSync, watch, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import Helper from '../../fork/Helper'
import { resolve as PathResolve, resolve } from 'path'
import ZH from '@lang/zh'
import EN from '@lang/en'
import { AppAllLang, AppI18n } from '@lang/index'
import { createMarkdownRenderer } from '@/util/markdown/markdown'
import { isLinux, isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'
import { realpath } from '@shared/fs-extra'
import { parse as TOMLParse, stringify as TOMLStringify } from '@iarna/toml'
import { copy, mkdirp, writeFile, readFile, copyFile, chmod, remove } from '@shared/fs-extra'
import crypto from 'node:crypto'
import is from 'electron-is'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)

const { pki } = require('node-forge')
const { types, extensions } = require('mime-types')

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

  mime_types(command: string, key: string) {
    this?.mainWindow?.webContents.send('command', command, key, { types, extensions })
  }

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
    this?.mainWindow?.webContents?.send?.('command', command, key, isDark)
    this?.trayWindow?.webContents?.send?.('command', command, key, isDark)
  }

  nativeTheme_watch() {
    nativeTheme.on('updated', () => {
      this?.mainWindow?.webContents?.send?.(
        'command',
        'App-Native-Theme-Update',
        'App-Native-Theme-Update',
        true
      )
      this?.trayWindow?.webContents?.send?.(
        'command',
        'App-Native-Theme-Update',
        'App-Native-Theme-Update',
        true
      )
    })
  }

  toml_parse(command: string, key: string, json: any) {
    try {
      const res = TOMLParse(json)
      this?.mainWindow?.webContents.send('command', command, key, res)
    } catch {
      this?.mainWindow?.webContents.send('command', command, key, null)
    }
  }

  toml_stringify(command: string, key: string, json: any) {
    try {
      const res = TOMLStringify(json)
      this?.mainWindow?.webContents.send('command', command, key, res)
    } catch {
      this?.mainWindow?.webContents.send('command', command, key, null)
    }
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

  private async linuxAutoLaunch(autoLaunch: boolean) {
    if (autoLaunch) {
      let icon = ''
      if (is.production()) {
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        icon = join(binDir, 'helper/512x512.png')
      } else {
        icon = join(global.Server.Static!, '512x512.png')
      }

      const desktopFileContent = `[Desktop Entry]
Type=Application
Name=${app.name}
Exec=${app.getPath('exe')}
Icon=${icon}
StartupNotify=false
Terminal=false
X-GNOME-Autostart-enabled=true`

      const autostartDir = join(homedir(), '.config', 'autostart')
      await mkdirp(autostartDir)
      const desktopFilePath = join(autostartDir, `${app.name}.desktop`)
      await writeFile(desktopFilePath, desktopFileContent)
      await chmod(desktopFilePath, '0755')
    } else {
      const desktopFilePath = join(
        require('os').homedir(),
        '.config',
        'autostart',
        `${app.name}.desktop`
      )

      if (existsSync(desktopFilePath)) {
        await remove(desktopFilePath)
      }
    }
  }

  private async windowsAutoLaunch(autoLaunch: boolean) {
    const exePath = app.getPath('exe').replace(/"/g, '\\"')
    console.log('exePath: ', exePath)
    const taskName = 'FlyEnvStartup'
    if (autoLaunch) {
      const tmpl = await readFile(join(global.Server.Static!, 'sh/flyenv-auto-start.ps1'), 'utf-8')
      const content = tmpl.replace('#TASKNAME#', taskName).replace('#EXECPATH#', exePath)
      await mkdirp(global.Server.Cache!)
      const file = join(global.Server.Cache!, 'flyenv-auto-start.ps1')
      await writeFile(file, content)
      const command = `Unblock-File -LiteralPath '${file}'; & '${file}'`
      const res: any = await Helper.send('tools', 'exec', command)
      await remove(file)
      const std = res.stdout + res.stderr
      if (std.includes(`Task Create Success: FlyEnvStartup`)) {
        return true
      }
      throw new Error(res.stderr)
    } else {
      try {
        await Helper.send('tools', 'exec', `schtasks.exe /delete /tn "${taskName}" /f`)
      } catch {}
      return true
    }
  }

  app_setLoginItemSettings(command: string, key: string, param: any) {
    const obj = {
      openAtLogin: param?.openAtLogin ?? false
    }
    console.log('app_setLoginItemSettings: ', param, obj)

    if (isWindows()) {
      this.windowsAutoLaunch(obj.openAtLogin)
        .then(() => {
          this?.mainWindow?.webContents.send('command', command, key, true)
        })
        .catch((error) => {
          this?.mainWindow?.webContents.send('command', command, key, `${error}`)
        })
      return
    }

    if (isLinux()) {
      this.linuxAutoLaunch(obj.openAtLogin)
        .then(() => {
          this?.mainWindow?.webContents.send('command', command, key, true)
        })
        .catch((error) => {
          this?.mainWindow?.webContents.send('command', command, key, `${error}`)
        })
      return
    }

    app.setLoginItemSettings(obj)
    if (!obj.openAtLogin && isMacOS()) {
      try {
        if (is.production()) {
          Helper.send(
            'tools',
            'exec',
            `osascript -e 'tell application "System Events" to delete login item "FlyEnv"'`
          ).catch()
        } else {
          Helper.send(
            'tools',
            'exec',
            `osascript -e 'tell application "System Events" to delete login item "Electron"'`
          ).catch()
        }
      } catch {}
    }
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
    execPromise(cmd, opt)
      .then((res) => {
        this?.mainWindow?.webContents.send('command', command, key, {
          stdout: res.stdout.toString(),
          stderr: res.stderr.toString()
        })
      })
      .catch((err) => {
        this?.mainWindow?.webContents.send('command', command, key, {
          error: `${err}`,
          stdout: '',
          stderr: ''
        })
      })
  }

  fs_chmod(command: string, key: string, path: string, mode: string | number) {
    chmod(path, mode)
      .then(() => {
        this?.mainWindow?.webContents.send('command', command, key, true)
      })
      .catch(() => {
        this?.mainWindow?.webContents.send('command', command, key, false)
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
        Helper.send('tools', 'writeFileByRoot', path, data)
          .then(() => {
            this?.mainWindow?.webContents.send('command', command, key, true)
          })
          .catch(() => {
            this?.mainWindow?.webContents.send('command', command, key, false)
          })
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

  fs_copyFile(command: string, key: string, src: string, dest: string) {
    copyFile(src, dest)
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
        Helper.send('tools', 'readFileByRoot', path)
          .then((data) => {
            this?.mainWindow?.webContents.send('command', command, key, data)
          })
          .catch(() => {
            this?.mainWindow?.webContents.send('command', command, key, '')
          })
      })
  }

  fs_writeFile(command: string, key: string, path: string, data: string) {
    writeFile(path, data)
      .then(() => {
        this?.mainWindow?.webContents.send('command', command, key, true)
      })
      .catch(() => {
        Helper.send('tools', 'writeFileByRoot', path, data)
          .then(() => {
            this?.mainWindow?.webContents.send('command', command, key, true)
          })
          .catch(() => {
            this?.mainWindow?.webContents.send('command', command, key, false)
          })
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
