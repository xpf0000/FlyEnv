import { EventEmitter } from 'events'
import { app, BrowserWindow, screen, shell } from 'electron'
import pageConfig from '../configs/page'
import { debounce } from 'lodash'

const { initialize, enable } = require('@electron/remote/main')

initialize()

const defaultBrowserOptions = {
  titleBarStyle: 'hiddenInset',
  show: false,
  width: 1024,
  height: 768,
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
    enableRemoteModule: false,
    webSecurity: false
  }
}
export default class WindowManager extends EventEmitter {
  constructor(options = {}) {
    super()
    this.configManager = options.configManager
    this.userConfig = this.configManager.getConfig()

    this.windows = {}

    this.captureWins = []

    this.willQuit = false

    this.handleBeforeQuit()

    this.handleAllWindowClosed()
  }

  setWillQuit(flag) {
    this.willQuit = flag
  }

  getPageOptions(page) {
    const result = pageConfig[page] || {}
    // Optimized for small screen users
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const widthScale = width >= 1280 ? 1 : 0.875
    const heightScale = height >= 800 ? 1 : 0.875
    result.attrs.width *= widthScale
    result.attrs.height *= heightScale
    return result
  }

  getPageBounds(page) {
    const windowStateMap = this.userConfig['window-state'] || {}
    return windowStateMap[page]
  }

  openWindow(page, options = {}) {
    const pageOptions = this.getPageOptions(page)
    const { hidden } = options
    console.log('pageOptions: ', pageOptions)
    let window = this.windows[page] || null
    if (window) {
      window.show()
      window.focus()
      return window
    }

    window = new BrowserWindow({
      ...defaultBrowserOptions,
      ...pageOptions.attrs
    })
    // window.webContents.openDevTools()
    enable(window.webContents)
    const bounds = this.getPageBounds(page)
    console.log('bounds ====>', bounds)
    if (bounds) {
      window.setBounds(bounds)
    }

    window.webContents.on('new-window', (e, url) => {
      e.preventDefault()
      shell.openExternal(url).then()
    })

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

  getWindow(page) {
    return this.windows[page]
  }

  getWindows() {
    return this.windows || {}
  }

  getWindowList() {
    return Object.values(this.getWindows())
  }

  addWindow(page, window) {
    this.windows[page] = window
  }

  destroyWindow(page) {
    const win = this.getWindow(page)
    this.removeWindow(page)
    win.removeListener('closed')
    win.removeListener('move')
    win.removeListener('resize')
    win.destroy()
  }

  removeWindow(page) {
    this.windows[page] = null
  }

  bindAfterClosed(page, window) {
    window.on('closed', () => {
      this.removeWindow(page)
    })
  }

  handleWindowState(page, window) {
    window.on(
      'resize',
      debounce(() => {
        const bounds = window.getBounds()
        this.emit('window-resized', { page, bounds })
      }, 500)
    )

    window.on(
      'move',
      debounce(() => {
        const bounds = window.getBounds()
        this.emit('window-moved', { page, bounds })
      }, 500)
    )
  }

  handleWindowClose(pageOptions, page, window) {
    window.on('close', (event) => {
      if (pageOptions.bindCloseToHide && !this.willQuit) {
        event.preventDefault()
        window.hide()
      }
      const bounds = window.getBounds()
      this.emit('window-closed', { page, bounds })
    })
  }

  showWindow(page) {
    const window = this.getWindow(page)
    if (!window) {
      return
    }
    window.show()
  }

  hideWindow(page) {
    const window = this.getWindow(page)
    if (!window) {
      return
    }
    window.hide()
  }

  hideAllWindow() {
    this.getWindowList().forEach((window) => {
      window.hide()
    })
  }

  toggleWindow(page) {
    const window = this.getWindow(page)
    if (!window) {
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
    app.on('window-all-closed', (event) => {
      event.preventDefault()
    })
  }

  sendCommandTo(window, command, ...args) {
    if (!window) {
      return
    }
    window.webContents.send('command', command, ...args)
  }

  sendMessageTo(window, channel, ...args) {
    if (!window) {
      return
    }
    window.webContents.send(channel, ...args)
  }
}
