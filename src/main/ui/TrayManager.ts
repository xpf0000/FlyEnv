import { EventEmitter } from 'events'
import { join } from 'path'
import { Menu, Tray, nativeImage, screen } from 'electron'
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

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Apache', type: 'checkbox' },
      { label: 'Nginx', type: 'checkbox' },
      { label: 'Php', type: 'checkbox', checked: true },
      { label: 'Mysql', type: 'checkbox' }
    ])
    this.tray.setContextMenu(contextMenu)
    this.tray.on('click', this.handleTrayClick)
    this.tray.on('right-click', this.handleTrayClick)
  }

  iconChange(status: boolean) {
    this.active = status
    this.tray.setImage(this.active ? this.activeIcon : this.normalIcon)
  }

  handleTrayClick = (event: any, bounds: any) => {
    event?.preventDefault && event?.preventDefault()
    const points = screen.getCursorScreenPoint()  
    const screenWidth = screen.getPrimaryDisplay().workAreaSize.width
    console.log('handleTrayClick: ',screenWidth, points, event, bounds)
    const x = Math.min(points.x - 135, screenWidth - 270)
    const poperX = Math.max(15, points.x - x - 6)
    this.emit('click', x, poperX)
  }

  destroy() {
    this.tray.destroy()
  }
}
