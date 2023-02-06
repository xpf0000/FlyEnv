import { EventEmitter } from 'events'
import { join } from 'path'
import { Tray, nativeImage, screen } from 'electron'
let tray = null

export default class TrayManager extends EventEmitter {
  constructor() {
    super()
    this.menu = null
    this.load()
    this.init()
    this.handleEvents()
  }

  load() {
    this.normalIcon = nativeImage.createFromPath(join(__static, '32x32.png'))
    this.activeIcon = nativeImage.createFromPath(join(__static, '32x32_active.png'))
  }

  init() {
    this.active = false
    tray = new Tray(this.normalIcon)
    tray.setToolTip('PhpWebStudy')
  }

  handleEvents() {
    tray.on('click', this.handleTrayClick)
  }

  iconChange(status) {
    this.active = status
    tray.setImage(this.active ? this.activeIcon : this.normalIcon)
  }

  handleTrayClick = (event) => {
    event?.preventDefault && event?.preventDefault()
    const bounds = tray.getBounds()
    const screenWidth = screen.getPrimaryDisplay().workAreaSize.width
    let x = Math.min(bounds.x - 150 + bounds.width * 0.5, screenWidth - 300)
    const poperX = Math.max(15, bounds.x + bounds.width * 0.5 - x - 6)
    this.emit('click', x, poperX)
  }

  destroy() {
    tray.destroy()
  }
}
