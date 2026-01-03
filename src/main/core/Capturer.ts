import { dialog, Rectangle, shell, clipboard, nativeImage } from 'electron'
import { desktopCapturer, screen, BrowserWindow, globalShortcut } from 'electron'
import { windowManager, Window } from '@xpf0000/node-window-manager'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as PathResolve, join } from 'node:path'
import is from 'electron-is'
import { ViteDevPort } from '../../../configs/vite.port'
import { isWindows } from '@shared/utils'
import { existsSync, mkdirp, writeFile, readdir } from '@shared/fs-extra'
import { randomUUID } from 'node:crypto'
import { I18nT } from '@lang/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const index = PathResolve(__dirname, '../render/capturer/capturer.html')

type WindowItem = {
  id: string
  name: string
  display_id: string
  display?: {
    bounds: Rectangle
    workArea: Rectangle
    scaleFactor: number
  }
}

type WindowBoundAndInfo = {
  id: number
  bounds: Rectangle
  name: string
}

type CapturerConfig = {
  key: string[]
  dir: string
  name: string
}

export class Capturer {
  isFullScreen: boolean = false
  useWindow: boolean = true
  capturerWindow: Window | undefined = undefined
  capturerWindowID: number = 0
  capturering: boolean = false
  destroyTimer: NodeJS.Timeout | undefined = undefined
  timer: NodeJS.Timeout | undefined = undefined
  window: BrowserWindow | undefined = undefined
  currentPoint: {
    x: number
    y: number
  } = {
    x: 0,
    y: 0
  }
  windows: Record<number, WindowBoundAndInfo> = {}
  needCheckWindowInPoint: boolean = true
  config: CapturerConfig = {
    key: [],
    name: '',
    dir: ''
  }

  stopCapturer() {
    globalShortcut.unregister('Escape')
    clearInterval(this.timer)
    this.timer = undefined
    this.window?.hide()
    this.isFullScreen = false
    this.destroyTimer = setTimeout(
      () => {
        this.window?.destroy()
        this.window = undefined
        this.capturerWindowID = 0
        this.capturerWindow = undefined
      },
      2 * 60 * 1000
    )
    this.window?.webContents?.send?.(
      'command',
      'APP:Capturer-Window-Clean',
      'APP:Capturer-Window-Clean'
    )
    this.capturering = false
  }

  registShortcut() {
    globalShortcut.register('CommandOrControl+Shift+A', () => {
      console.log('Ctrl+Shift+A 被按下')
      if (this.capturering) {
        return
      }
      this.initWatchPointWindow().catch()
    })
  }

  getWindowCapturer(id: number) {
    const image = windowManager.captureWindow(id)
    console.log('getWindowCapturer image: ', image)
    if (image) {
      this.window?.webContents?.send?.(
        'command',
        'APP:Capturer-Window-Image-Get',
        'APP:Capturer-Window-Image-Get',
        {
          id,
          image
        }
      )
    }
  }

  async initWatchPointWindow() {
    globalShortcut.register('Escape', () => {
      this.stopCapturer()
    })
    this.capturering = true
    clearTimeout(this.destroyTimer)
    clearInterval(this.timer)
    this.windows = {}
    this.needCheckWindowInPoint = true

    let base64Image = ''
    const title = 'FlyEnv-Capturer-Window-I3MCDmGbp2IJy9T69RHFs7p0mwGg1WHB'
    const display = screen.getPrimaryDisplay()
    console.log('scaleFactor: ', display.scaleFactor)
    console.log('原始bounds:', display.bounds)
    let screenRect = undefined

    if (isWindows()) {
      try {
        const deskID = windowManager.getDesktopWindowID()
        base64Image = windowManager.captureWindow(deskID)
      } catch {
        dialog.showErrorBox(I18nT('tools.CapturerFailTitle'), I18nT('tools.CapturerFailContent'))
        return
      }
      screenRect = {
        x: 0,
        y: 0,
        width: Math.floor(display.bounds.width * display.scaleFactor),
        height: Math.floor(display.bounds.height * display.scaleFactor)
      }
      console.log('Desktop Bounds:', screenRect)
    } else {
      const getScreenThumbnail = async (retry = 0) => {
        if (retry > 2) {
          return false
        }
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: Math.floor(display.bounds.width * display.scaleFactor),
              height: Math.floor(display.bounds.height * display.scaleFactor)
            }
          })
          console.log('desktopCapturer.getSources sources: ', sources)
          const image = sources[0].thumbnail
          base64Image = image.toDataURL()
          console.log('desktopCapturer.getSources base64Image: ', base64Image.length)
          if (base64Image.length < 500) {
            return await getScreenThumbnail(retry + 1)
          }
          return true
        } catch (e) {
          console.error('desktopCapturer.getSources error: ', e)
          return await getScreenThumbnail(retry + 1)
        }
      }
      const res = await getScreenThumbnail(0)
      if (!res) {
        dialog.showErrorBox(I18nT('tools.CapturerFailTitle'), I18nT('tools.CapturerFailContent'))
        return
      }
      screenRect = {
        x: 0,
        y: 0,
        width: Math.floor(display.bounds.width * display.scaleFactor),
        height: Math.floor(display.bounds.height * display.scaleFactor)
      }
    }

    const init = (window: BrowserWindow) => {
      this.isFullScreen = false
      window.setAlwaysOnTop(true, 'screen-saver')
      // window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      window.show()
      setTimeout(() => {
        window.setAlwaysOnTop(true, 'screen-saver')
      }, 100)
      window.focus()
      window.moveTop()
      window.webContents?.send?.(
        'command',
        'APP:Capturer-Window-Screen-Image-Update',
        'APP:Capturer-Window-Screen-Image-Update',
        {
          image: base64Image,
          screenRect,
          scaleFactor: display.scaleFactor
        }
      )
      if (!this.capturerWindowID) {
        const all = windowManager.getWindows()
        console.log('windowManager.getWindows all: ', all)
        const find = all.find((a) => a.getName().includes(title))
        this.capturerWindow = find
        const activeId = find?.id ?? 0
        console.log('find: ', activeId, find?.getName())
        this.capturerWindowID = activeId
      }
      if (!this.isFullScreen && isWindows()) {
        if (this.capturerWindow) {
          this.isFullScreen = true
          this.capturerWindow?.setFullScreen()
        }
      }
      this.timer = setInterval(() => {
        if (!this.needCheckWindowInPoint) {
          clearInterval(this.timer)
          return
        }
        const point = screen.getCursorScreenPoint()
        if (point.x === this.currentPoint.x && point.y === this.currentPoint.y) {
          return
        }
        this.currentPoint.x = point.x
        this.currentPoint.y = point.y
        let x = point.x
        let y = point.y
        if (isWindows()) {
          x = Math.floor(x * display.scaleFactor)
          y = Math.floor(y * display.scaleFactor)
        }
        const pointWindow = windowManager.getWindowAtPoint(x, y, this.capturerWindowID)
        console.log(
          'getWindowAtPoint: ',
          {
            x,
            y
          },
          pointWindow.id,
          pointWindow.getTitle(),
          pointWindow.getName()
        )
        if (pointWindow.id) {
          let item = this.windows?.[pointWindow.id]
          console.log('getWindowAtPoint item: ', item)
          if (!item) {
            const bounds: Rectangle = pointWindow.getBounds() as any
            const name = pointWindow.getName()
            if (isWindows()) {
              bounds.x /= display.scaleFactor
              bounds.y /= display.scaleFactor
              bounds.width /= display.scaleFactor
              bounds.height /= display.scaleFactor
            }
            item = {
              id: pointWindow.id,
              bounds,
              name
            }
            this.windows[pointWindow.id] = item
          }
          window.webContents?.send?.(
            'command',
            'APP:Capturer-Window-Rect-Update',
            'APP:Capturer-Window-Rect-Update',
            JSON.parse(JSON.stringify(item))
          )
        } else {
          const item = {
            id: -1,
            bounds: {
              x: 0,
              y: 0,
              width: display.bounds.width,
              height: display.bounds.height
            },
            name: 'Full Screen'
          }
          window.webContents?.send?.(
            'command',
            'APP:Capturer-Window-Rect-Update',
            'APP:Capturer-Window-Rect-Update',
            item
          )
        }
      }, 150)
    }

    if (this.window) {
      init(this.window)
      return
    }

    const window = new BrowserWindow({
      x: 0,
      // 向上移动窗口，使其顶部覆盖菜单栏
      y: 0,
      type: 'toolbar',
      width: display.bounds.width,
      height: display.bounds.height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      hasShadow: false,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        backgroundThrottling: false, // 禁止后台节流
        preload: join(global.Server.Static!, 'preload/preload.js')
      }
    })

    window.setMenu(null)

    if (is.dev()) {
      window.loadURL(`http://localhost:${ViteDevPort}/capturer/capturer.html`).catch()
    } else {
      window.loadFile(index).catch()
    }
    window.once('ready-to-show', () => {
      init(window)
    })
    window.on('show', () => {
      console.log('window show !!!!!!')
      if (!this.isFullScreen && isWindows()) {
        if (this.capturerWindow) {
          this.isFullScreen = true
          this.capturerWindow?.setFullScreen()
        }
      }
    })
    this.window = window
  }

  stopCheckWindowInPoint() {
    this.needCheckWindowInPoint = false
    clearInterval(this.timer)
  }

  async getAllWindows(): Promise<WindowItem[]> {
    try {
      const displays = screen.getAllDisplays()
      console.log('getAllWindows displays', displays)
      const sources = await desktopCapturer.getSources({
        types: ['window']
      })

      const all = sources.map((source) => {
        console.log('getAllWindows source', source)
        // 根据display_id找到对应的显示器
        const display = displays.find((d) => d.id.toString() === source.display_id)
        return {
          id: source.id,
          name: source.name,
          display_id: source.display_id,
          display: display
            ? {
                bounds: display.bounds,
                workArea: display.workArea,
                scaleFactor: display.scaleFactor
              }
            : undefined
        }
      })
      console.log('getAllWindows all: ', all)
      return all
    } catch (error) {
      console.error('获取窗口位置失败:', error)
      return []
    }
  }

  async saveImage(base64: string, userConfig?: boolean) {
    const chooseDirSave = () => {
      const timestramp = Math.floor(new Date().getTime() / 1000)
      const name = `flyenv-capturer-${timestramp}.png`
      dialog
        .showSaveDialog({
          properties: ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation'],
          defaultPath: name,
          filters: [
            {
              name: 'PNG Files',
              extensions: ['png']
            }
          ]
        })
        .then(({ canceled, filePath }: any) => {
          if (canceled || !filePath) {
            return
          }
          const buffer = Buffer.from(base64, 'base64')
          writeFile(filePath, buffer).then(() => {
            shell.showItemInFolder(filePath)
          })
        })
    }
    if (!userConfig || !this.config.dir) {
      chooseDirSave()
      return
    }
    try {
      await mkdirp(this.config.dir)
    } catch {}
    if (!existsSync(this.config.dir)) {
      chooseDirSave()
      return
    }
    const date = new Date()
    const timestramp = Math.floor(date.getTime() / 1000)
    let name = this.config.name.trim()
    if (name) {
      const time = date.toISOString()
      const uuid = randomUUID()
      name = name
        .replace(/\{timestramp}/g, `${timestramp}`)
        .replace(/\{datetime}/g, `${time}`)
        .replace(/\{uuid}/g, `${uuid}`)
      if (name.includes('{index}')) {
        let all = await readdir(this.config.dir)
        all = all.map((f) => f.toLowerCase())
        const pngCount = all.filter((a) => a.endsWith('.png')).length
        let index = pngCount + 1
        let tmplName = name.replace(/\{index}/g, `${index}`)
        while (all.includes(`${tmplName}.png`.toLowerCase())) {
          index += 1
          tmplName = name.replace(/\{index}/g, `${index}`)
        }
        name = tmplName
      }
      name += '.png'
    } else {
      name = `flyenv-capturer-${timestramp}.png`
    }
    const buffer = Buffer.from(base64, 'base64')
    const filePath = join(this.config.dir, name)
    writeFile(filePath, buffer).then(() => {
      clipboard.writeImage(nativeImage.createFromPath(filePath))
      shell.showItemInFolder(filePath)
    })
  }

  configUpdate(config: CapturerConfig) {
    if (this.config.key.length) {
      globalShortcut.unregister(this.config.key.join('+'))
    }
    this.config = config
    if (this.config.key.length) {
      globalShortcut.register(this.config.key.join('+'), () => {
        if (this.capturering) {
          return
        }
        this.initWatchPointWindow().catch()
      })
    }
  }
}
