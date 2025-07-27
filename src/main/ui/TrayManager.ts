import { EventEmitter } from 'events'
import { join } from 'path'
import { Tray, nativeImage, screen, Menu } from 'electron'
import NativeImage = Electron.NativeImage
import { isWindows } from '@shared/utils'
import { I18nT } from '@lang/index'
import MenuItemConstructorOptions = Electron.MenuItemConstructorOptions

export default class TrayManager extends EventEmitter {
  normalIcon: NativeImage
  activeIcon: NativeImage
  stopIcon: NativeImage
  runIcon: NativeImage
  active: boolean
  tray: Tray
  constructor() {
    super()
    this.active = false
    this.normalIcon = nativeImage.createFromPath(join(global.__static, '32x32.png'))
    this.activeIcon = nativeImage.createFromPath(join(global.__static, '32x32_active.png'))
    this.stopIcon = nativeImage
      .createFromPath(join(__static, 'stop.png'))
      .resize({ width: 10, height: 10 })
    this.runIcon = nativeImage
      .createFromPath(join(__static, 'run.png'))
      .resize({ width: 10, height: 10 })
    this.tray = new Tray(this.normalIcon)
    this.tray.setToolTip('FlyEnv')

    // this.tray.on('click', this.handleTrayClick)
    // if (!isLinux()) {
    //   this.tray.on('right-click', this.handleTrayClick)
    //   this.tray.on('double-click', () => {
    //     this.emit('double-click')
    //   })
    // }
  }

  menuChange(status: any) {
    console.log('menuChange: ', status)
    this.iconChange(status.groupIsRunning)
    const menus: MenuItemConstructorOptions[] = []
    menus.push({
      label: status.groupIsRunning ? I18nT('tray.run') : I18nT('tray.notRun'),
      type: 'normal',
      enabled: !status.groupDisabled,
      icon: status.groupIsRunning ? this.runIcon : this.stopIcon,
      click: () => {
        console.log('action serviceAll !!!')
        this.emit('action', 'groupDo')
      }
    })
    menus.push({
      type: 'separator'
    })

    const service: any[] = status?.service ?? []

    if (service.length > 0) {
      for (const item of service) {
        menus.push({
          label: item.label,
          type: 'normal',
          enabled: !item.disabled && !item.running,
          icon: item.run ? this.runIcon : this.stopIcon,
          click: () => {
            console.log('action service: ', item)
            this.emit('action', 'switchChange', item?.typeFlag ?? item?.id)
          }
        })
      }

      menus.push({
        type: 'separator'
      })
    }

    menus.push({
      label: I18nT('tray.showMainWin'),
      type: 'normal',
      click: () => {
        this.emit('action', 'show')
      }
    })
    menus.push({
      label: I18nT('tray.exit'),
      type: 'normal',
      click: () => {
        this.emit('action', 'exit')
      }
    })
    const contextMenu = Menu.buildFromTemplate(menus)

    this.tray.setContextMenu(contextMenu)
  }

  iconChange(status: boolean) {
    this.active = status
    this.tray.setImage(this.active ? this.activeIcon : this.normalIcon)
  }

  handleTrayClick = (event: any) => {
    console.log('handleTrayClick !!!')
    event?.preventDefault?.()
    const bounds = this.tray.getBounds()
    const screenWidth = screen.getPrimaryDisplay().workAreaSize.width
    const x = Math.min(bounds.x - 135 + bounds.width * 0.5, screenWidth - 270)
    const poperX = Math.max(15, bounds.x + bounds.width * 0.5 - x - 6)
    if (isWindows()) {
      const y = bounds.y - 445
      this.emit('click', x, y, poperX)
    } else {
      const y = bounds.y + bounds.height
      this.emit('click', x, y, poperX)
    }
  }

  destroy() {
    this.tray.destroy()
  }
}
