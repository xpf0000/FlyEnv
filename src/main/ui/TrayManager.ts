import { EventEmitter } from 'events'
import { join } from 'path'
import { Tray, nativeImage, screen } from 'electron'
import NativeImage = Electron.NativeImage

export default class TrayManager extends EventEmitter {
  normalIcon: NativeImage
  activeIcon: NativeImage
  active: boolean
  tray: Tray
  constructor() {
    super()
    this.active = false
    this.normalIcon = nativeImage.createFromPath(join(__static, '32x32.png'))
    this.activeIcon = nativeImage.createFromPath(join(__static, '32x32_active.png'))
    this.tray = new Tray(this.normalIcon)
    this.tray.setToolTip('PhpWebStudy')
    this.tray.on('click', this.handleTrayClick)
  }

  iconChange(status: boolean) {
    this.active = status
    this.tray.setImage(this.active ? this.activeIcon : this.normalIcon)
  }

  handleTrayClick = (event: any) => {
    event?.preventDefault && event?.preventDefault()
    const bounds = this.tray.getBounds()
    const screenWidth = screen.getPrimaryDisplay().workAreaSize.width
    const x = Math.min(bounds.x - 150 + bounds.width * 0.5, screenWidth - 300)
    const poperX = Math.max(15, bounds.x + bounds.width * 0.5 - x - 6)
    this.emit('click', x, poperX)
  }

  destroy() {
    this.tray.destroy()
  }
}
