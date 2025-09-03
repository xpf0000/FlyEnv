import { EventEmitter } from 'events'
import { app, BrowserWindow, nativeImage, screen } from 'electron'
import pageConfig from '../configs/page'
import { debounce } from 'lodash-es'
import Event = Electron.Main.Event
import BrowserWindowConstructorOptions = Electron.BrowserWindowConstructorOptions
import { join } from 'path'
import { isMacOS } from '@shared/utils'
import is from 'electron-is'
import { AppStartErrorCallback } from '../app'

const defaultBrowserOptions: BrowserWindowConstructorOptions = {
  titleBarStyle: 'hiddenInset',
  autoHideMenuBar: !isMacOS(),
  show: false,
  width: 1200,
  height: 800,
  movable: true,
  resizable: true,
  backgroundColor: 'rgba(255,255,255,0)',
  transparent: false,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: true,
    webviewTag: true
  }
}
const trayBrowserOptions: BrowserWindowConstructorOptions = {
  autoHideMenuBar: true,
  disableAutoHideCursor: true,
  frame: false,
  movable: false,
  resizable: false,
  show: false,
  width: 270,
  height: 435,
  opacity: 0,
  transparent: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: true,
    allowRunningInsecureContent: true
  }
}
export default class WindowManager extends EventEmitter {
  configManager: any
  userConfig: any
  windows: { [key: string]: BrowserWindow }
  willQuit: boolean

  constructor(options: { [key: string]: any } = {}) {
    super()
    this.configManager = options.configManager
    this.userConfig = this.configManager.getConfig()
    this.windows = {}
    this.willQuit = false
    this.handleBeforeQuit()
    this.handleAllWindowClosed()
  }

  setWillQuit(flag: boolean) {
    this.willQuit = flag
  }

  getPageOptions(page: string) {
    const result = pageConfig[page]
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const widthScale = width >= 1280 ? 1 : 0.875
    const heightScale = height >= 800 ? 1 : 0.875
    if (result?.attrs?.width) {
      result.attrs.width *= widthScale
    }
    if (result?.attrs?.height) {
      result.attrs.height *= heightScale
    }
    return result
  }

  getPageBounds(page: string) {
    const windowStateMap = this.userConfig['window-state'] || {}
    return windowStateMap[page]
  }

  openTrayWindow() {
    const page = 'tray'
    let window = this.windows.tray
    if (window) {
      return window
    }
    const pageOptions = this.getPageOptions(page)
    trayBrowserOptions.webPreferences!.preload = join(global.Server.Static!, 'preload/preload.js')
    window = new BrowserWindow(trayBrowserOptions)
    window.webContents.on('before-input-event', (event, input) => {
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
        event.preventDefault()
      }
    })
    window.webContents.on('will-navigate', (e) => e.preventDefault())
    window.setMenu(null)
    if (is.dev()) {
      window.loadURL(pageOptions.url).catch()
    } else {
      window.loadFile(pageOptions.url).catch()
    }
    window.on('close', (event: Event) => {
      if (pageOptions.bindCloseToHide && !this.willQuit) {
        event.preventDefault()
        window.hide()
      }
    })
    window.on('blur', (event: Event) => {
      event.preventDefault()
      window.hide()
    })
    this.bindAfterClosed(page, window)
    this.addWindow(page, window)
    return window
  }

  openWindow(page: string, options: { [key: string]: any } = {}) {
    const pageOptions = this.getPageOptions(page)
    const { hidden } = options
    let window = this.windows[page]
    if (window) {
      window.show()
      window.focus()
      console.log('openWindow !!!')
      return window
    }
    defaultBrowserOptions.webPreferences!.preload = join(
      global.Server.Static!,
      'preload/preload.js'
    )
    window = new BrowserWindow({
      ...defaultBrowserOptions,
      ...pageOptions.attrs,
      icon: nativeImage.createFromPath(join(global.__static, '512x512.png'))
    })
    window.webContents.on('before-input-event', (event, input) => {
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
        event.preventDefault()
      }
    })
    window.webContents.on('will-navigate', (e) => e.preventDefault())
    window.setMenu(null)
    const bounds = this.getPageBounds(page)
    if (bounds) {
      window.setBounds(bounds)
    }

    if (is.dev()) {
      window.loadURL(pageOptions.url).catch()
      window.webContents.openDevTools()
    } else {
      window.loadFile(pageOptions.url).catch((e) => {
        AppStartErrorCallback(e).catch()
      })
    }

    window.once('ready-to-show', () => {
      if (!hidden) {
        console.log('window.once ready-to-show !!!')
        window.show()
      }
    })

    this.handleWindowState(page, window)

    this.handleWindowClose(pageOptions, page, window)

    this.bindAfterClosed(page, window)

    this.addWindow(page, window)
    return window
  }

  getWindow(page: string): BrowserWindow {
    return this.windows[page]
  }

  getWindows() {
    return this.windows || {}
  }

  getWindowList() {
    return Object.values(this.getWindows())
  }

  addWindow(page: string, window: BrowserWindow) {
    this.windows[page] = window
  }

  destroyWindow(page: string) {
    const win = this.getWindow(page)
    this.removeWindow(page)
    if (win) {
      win.removeAllListeners()
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }
  }

  removeWindow(page: string) {
    delete this.windows[page]
  }

  bindAfterClosed(page: string, window: BrowserWindow) {
    window.on('closed', () => {
      this.removeWindow(page)
    })
  }

  handleWindowState(page: string, window: BrowserWindow) {
    if (page !== 'index') {
      return
    }
    window.on(
      'resize',
      debounce(() => {
        if (!window || window.isDestroyed()) {
          return
        }
        const bounds = window.getBounds()
        this.emit('window-resized', { page, bounds })
      }, 500)
    )

    window.on(
      'move',
      debounce(() => {
        if (!window || window.isDestroyed()) {
          return
        }
        const bounds = window.getBounds()
        this.emit('window-moved', { page, bounds })
      }, 500)
    )
  }

  handleWindowClose(pageOptions: { [key: string]: any }, page: string, window: BrowserWindow) {
    window.on('close', (event: Event) => {
      if (pageOptions.bindCloseToHide && !this.willQuit) {
        event.preventDefault()
        window.hide()
        if (isMacOS()) {
          app.dock?.hide?.()
        }
      }
      const bounds = window.getBounds()
      this.emit('window-closed', { page, bounds })
    })
  }

  showWindow(page: string) {
    const window = this.getWindow(page)
    if (!window || window.isDestroyed()) {
      return
    }
    window.show()
    console.log('showWindow !!!')
    if (isMacOS()) {
      app.dock?.show?.()?.catch()
    }
  }

  hideWindow(page: string) {
    const window = this.getWindow(page)
    if (!window || window.isDestroyed()) {
      return
    }
    window.hide()
  }

  hideAllWindow() {
    this.getWindowList().forEach((window) => {
      if (window && !window.isDestroyed()) {
        window.hide()
      }
    })
  }

  toggleWindow(page: string) {
    const window = this.getWindow(page)
    if (!window || window.isDestroyed()) {
      return
    }
    if (window.isVisible()) {
      window.hide()
    } else {
      window.show()
      console.log('toggleWindow !!!')
    }
  }

  getFocusedWindow() {
    return BrowserWindow.getFocusedWindow()
  }

  handleBeforeQuit() {
    app.on('before-quit', () => {
      this.setWillQuit(true)
    })
  }

  handleAllWindowClosed() {
    // @ts-ignore
    app.on('window-all-closed', (event: Event) => {
      event.preventDefault()
    })
  }

  sendCommandTo(window: BrowserWindow, command: string, ...args: any) {
    if (!window || window.isDestroyed()) {
      return
    }
    window.webContents.send('command', command, ...args)
  }

  sendMessageTo(window: BrowserWindow, channel: string, ...args: any) {
    if (!window || window.isDestroyed()) {
      return
    }
    window.webContents.send(channel, ...args)
  }
}
