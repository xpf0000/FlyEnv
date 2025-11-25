import type { Rectangle } from 'electron'
import { desktopCapturer, screen, BrowserWindow } from 'electron'
import { windowManager } from '@xpf0000/node-window-manager'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as PathResolve, join } from 'node:path'
import is from 'electron-is'
import { ViteDevPort } from '../../../configs/vite.port'

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

export class Capturer {
  useWindow: boolean = true
  timer: NodeJS.Timeout | undefined = undefined
  window: BrowserWindow | undefined = undefined

  stopCapturer() {
    clearInterval(this.timer)
    this.window?.destroy()
  }

  async initWatchPointWindow() {
    clearInterval(this.timer)
    this.window?.destroy()

    const display = screen.getPrimaryDisplay()

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: display.bounds.width, height: display.bounds.height }
    })

    const image = sources[0].thumbnail
    const base64Image = image.toDataURL()

    const window = new BrowserWindow({
      x: 0,
      // 向上移动窗口，使其顶部覆盖菜单栏
      y: 0,
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
      title: 'FlyEnv-Capturer-Window',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        webviewTag: true,
        preload: join(global.Server.Static!, 'preload/preload.js')
      }
    })

    window.setMenu(null)
    window.setAlwaysOnTop(true, 'screen-saver')

    if (is.dev()) {
      window.loadURL(`http://localhost:${ViteDevPort}/capturer/capturer.html`).catch()
    } else {
      window.loadFile(index).catch()
    }
    window.once('ready-to-show', () => {
      window.show()
      window.focus()
      window.moveTop()
      window.webContents?.send?.(
        'command',
        'APP:Capturer-Window-Screen-Image-Update',
        'APP:Capturer-Window-Screen-Image-Update',
        base64Image
      )
      const all = windowManager.getWindows()
      const find = all.find((a) => a.getName().includes('FlyEnv-Capturer-Window'))
      console.log('find: ', find?.id, find?.getTitle(), find?.getName())
      const activeId = find?.id
      this.timer = setInterval(() => {
        const point = screen.getCursorScreenPoint()
        const pointWindow = windowManager.getWindowAtPoint(point.x, point.y, activeId)
        console.log(
          'getWindowAtPoint: ',
          pointWindow.id,
          pointWindow.getTitle(),
          pointWindow.getName()
        )
        const rect = pointWindow.getBounds()
        window.webContents?.send?.(
          'command',
          'APP:Capturer-Window-Rect-Update',
          'APP:Capturer-Window-Rect-Update',
          JSON.parse(JSON.stringify(rect))
        )
      }, 200)
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
