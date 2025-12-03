import type { Rectangle } from 'electron'
import { desktopCapturer, screen, BrowserWindow, globalShortcut } from 'electron'
import { windowManager, Window } from '@xpf0000/node-window-manager'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as PathResolve, join } from 'node:path'
import is from 'electron-is'
import { ViteDevPort } from '../../../configs/vite.port'
import { isWindows } from '@shared/utils'

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

  stopCapturer() {
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
    this.capturering = true
    clearTimeout(this.destroyTimer)
    clearInterval(this.timer)
    this.windows = {}

    let base64Image = ''
    const title = 'FlyEnv-Capturer-Window-I3MCDmGbp2IJy9T69RHFs7p0mwGg1WHB'
    const display = screen.getPrimaryDisplay()
    console.log('scaleFactor: ', display.scaleFactor)
    console.log('原始bounds:', display.bounds)
    let screenRect = undefined

    if (isWindows()) {
      const deskID = windowManager.getDesktopWindowID()
      base64Image = windowManager.captureWindow(deskID)
      const desk = new Window(deskID)
      screenRect = desk.getBounds()
      console.log('Desktop Bounds:', screenRect)
    } else {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.floor(display.bounds.width * display.scaleFactor),
          height: Math.floor(display.bounds.height * display.scaleFactor)
        }
      })
      const image = sources[0].thumbnail
      base64Image = image.toDataURL()
    }

    const init = (window: BrowserWindow) => {
      this.isFullScreen = false
      window.setAlwaysOnTop(true, 'screen-saver')
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
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
          screenRect
        }
      )
      if (!this.capturerWindowID) {
        const all = windowManager.getWindows()
        const find = all.find((a) => a.getName().includes(title))
        this.capturerWindow = find
        const activeId = find?.id ?? 0
        console.log('find: ', activeId, find?.getName())
        this.capturerWindowID = activeId
      }
      if (!this.isFullScreen && isWindows()) {
        this.isFullScreen = true
        this.capturerWindow?.setFullScreen()
      }
      this.timer = setInterval(() => {
        const point = screen.getCursorScreenPoint()
        if (point.x === this.currentPoint.x && point.y === this.currentPoint.y) {
          return
        }
        this.currentPoint.x = point.x
        this.currentPoint.y = point.y
        const pointWindow = windowManager.getWindowAtPoint(point.x, point.y, this.capturerWindowID)
        console.log(
          'getWindowAtPoint: ',
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
            id: 0,
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
      // paintWhenInitiallyHidden: false,
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
        this.isFullScreen = true
        this.capturerWindow?.setFullScreen()
      }
    })
    this.window = window
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
}
