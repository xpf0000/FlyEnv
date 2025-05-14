import { EventEmitter } from 'events'
import { app, BrowserWindow, screen } from 'electron'
import pageConfig from '../configs/page'
import { debounce } from 'lodash'
import Event = Electron.Main.Event
import BrowserWindowConstructorOptions = Electron.BrowserWindowConstructorOptions

const { initialize, enable } = require('@electron/remote/main')

initialize()

const defaultBrowserOptions: BrowserWindowConstructorOptions = {
  titleBarStyle: 'hiddenInset',
  show: false,
  width: 1200,
  height: 800,
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
    webSecurity: false,
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
    nodeIntegration: true,
    contextIsolation: false,
    webSecurity: false
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
    window = new BrowserWindow(trayBrowserOptions)
    enable(window.webContents)
    window.webContents.on('before-input-event', (event, input) => {
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
        event.preventDefault()
      }
    })
    window.webContents.on('will-navigate', (e) => e.preventDefault())
    window.setMenu(null)
    window.loadURL(pageOptions.url).then()
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
      return window
    }

    window = new BrowserWindow({
      ...defaultBrowserOptions,
      ...pageOptions.attrs
    })
    enable(window.webContents)
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

    if (pageOptions.url) {
      window.loadURL(pageOptions.url).then()
    }

    window.once('ready-to-show', () => {
      if (!hidden) {
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
      win.removeAllListeners('closed')
      win.removeAllListeners('move')
      win.removeAllListeners('resize')
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
        app.dock.hide()
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
    app.dock.show().then()
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
