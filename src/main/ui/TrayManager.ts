import { EventEmitter } from 'events'
import { join } from 'path'
import { Tray, nativeImage, screen } from 'electron'
import NativeImage = Electron.NativeImage
import { isWindows } from '@shared/utils'

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
    this.tray.setToolTip('FlyEnv')
    this.tray.on('click', this.handleTrayClick)
    this.tray.on('right-click', this.handleTrayClick)
    this.tray.on('double-click', () => {
      this.emit('double-click')
    })
  }

  iconChange(status: boolean) {
    this.active = status
    this.tray.setImage(this.active ? this.activeIcon : this.normalIcon)
  }

  handleTrayClick = (event: any) => {
    event?.preventDefault?.()
    const bounds = this.tray.getBounds()
    const screenWidth = screen.getPrimaryDisplay().workAreaSize.width
    const x = Math.min(bounds.x - 135 + bounds.width * 0.5, screenWidth - 270)
    const poperX = Math.max(15, bounds.x + bounds.width * 0.5 - x - 6)
    if (isWindows()) {
      const y = bounds.y - 445
      this.emit('click', x, y, poperX)
    } else {
      this.emit('click', x, 0, poperX)
    }
  }

  destroy() {
    this.tray.destroy()
  }
}
