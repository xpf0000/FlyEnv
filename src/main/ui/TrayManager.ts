import { EventEmitter } from 'events'
import { join } from 'path'
import { Menu, Tray, nativeImage, screen } from 'electron'
import NativeImage = Electron.NativeImage
import { I18nT } from '../lang/index'

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
    
    // this.tray.on('click', this.handleTrayClick)
    // this.tray.on('right-click', this.handleTrayClick)
  }

  menuChange(status: any) {
    console.log('menuChange: ', status)
    const menus: any[] = []
    menus.push({
      label: 'ALL', 
      type: 'checkbox', 
      checked: status.groupIsRunning,
      enabled: !status.groupDisabled
    })
    menus.push({
      label: '', 
      type: 'separator'
    })
    if (status.apache.show) {
      menus.push({
        label: 'Apache', 
        type: 'checkbox', 
        checked: status.apache.run,
        enabled: !status.apache.running
      })
    }
    if (status.nginx.show) {
      menus.push({
        label: 'Nginx', 
        type: 'checkbox', 
        checked: status.nginx.run,
        enabled: !status.nginx.running
      })
    }
    if (status.caddy.show) {
      menus.push({
        label: 'Caddy', 
        type: 'checkbox', 
        checked: status.caddy.run,
        enabled: !status.caddy.running
      })
    }
    if (status.php.show) {
      menus.push({
        label: 'Php', 
        type: 'checkbox', 
        checked: status.php.run,
        enabled: !status.php.running
      })
    }
    if (status.mysql.show) {
      menus.push({
        label: 'Mysql', 
        type: 'checkbox', 
        checked: status.mysql.run,
        enabled: !status.mysql.running
      })
    }
    if (status.mariadb.show) {
      menus.push({
        label: 'MariaDB', 
        type: 'checkbox', 
        checked: status.mariadb.run,
        enabled: !status.mariadb.running
      })
    }
    if (status.postgresql.show) {
      menus.push({
        label: 'PostgreSql', 
        type: 'checkbox', 
        checked: status.postgresql.run,
        enabled: !status.postgresql.running
      })
    }
    if (status.memcached.show) {
      menus.push({
        label: 'Memcached', 
        type: 'checkbox', 
        checked: status.memcached.run,
        enabled: !status.memcached.running
      })
    }
    if (status.redis.show) {
      menus.push({
        label: 'Redis', 
        type: 'checkbox', 
        checked: status.redis.run,
        enabled: !status.redis.running
      })
    }
    if (status.dns.show) {
      menus.push({
        label: 'DNS Server', 
        type: 'checkbox', 
        checked: status.dns.run,
        enabled: !status.dns.running
      })
    }
    if (status.ftp.show) {
      menus.push({
        label: 'FTP', 
        type: 'checkbox', 
        checked: status.ftp.run,
        enabled: !status.ftp.running
      })
    }
    menus.push({
      label: '', 
      type: 'separator'
    })
    menus.push({
      label: I18nT('menu.showMainWin'), 
      type: 'normal'
    })
    menus.push({
      label: I18nT('menu.exit'),
      type: 'normal'
    })
    const contextMenu = Menu.buildFromTemplate(menus)
  
    this.tray.setContextMenu(contextMenu)
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
