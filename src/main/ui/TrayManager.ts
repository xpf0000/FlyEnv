import { EventEmitter } from 'events'
import { join } from 'path'
import { Tray, nativeImage, screen, Menu, BrowserWindow, Display } from 'electron'
import NativeImage = Electron.NativeImage
import Rectangle = Electron.Rectangle
import { isWindows } from '@shared/utils'
import type { TrayPopupSide, TrayState } from '@shared/Tray'
import { I18nT } from '@lang/runtime'
import logger from '../core/Logger'
import MenuItemConstructorOptions = Electron.MenuItemConstructorOptions

interface TrayPopupPlacement {
  x: number
  y: number
  side: TrayPopupSide
  arrowOffset: number
  fits: boolean
}

export default class TrayManager extends EventEmitter {
  normalIcon: NativeImage
  activeIcon: NativeImage
  stopIcon: NativeImage
  runIcon: NativeImage
  active: boolean
  tray: Tray
  style: 'modern' | 'classic' | '' = ''
  status: TrayState | undefined
  show: boolean = false
  clicking: boolean = false
  primed: boolean = false
  window: BrowserWindow | undefined

  constructor() {
    super()
    this.active = false
    this.normalIcon = nativeImage.createFromPath(join(global.__static, '32x32.png'))
    this.activeIcon = nativeImage.createFromPath(join(global.__static, '32x32_active.png'))
    const size = isWindows() ? 9 : 10
    this.stopIcon = nativeImage
      .createFromPath(join(__static, 'stop.png'))
      .resize({ width: size, height: size })
    this.runIcon = nativeImage
      .createFromPath(join(__static, 'run.png'))
      .resize({ width: size, height: size })
    this.tray = new Tray(this.normalIcon)
    this.tray.setToolTip('FlyEnv')
    this.onBlur = this.onBlur.bind(this)
  }

  addModernStyleListener() {
    if (!isWindows()) {
      this.tray.on('click', this.handleTrayClick)
    }
    this.tray.on('right-click', this.handleTrayClick)
    this.tray.on('double-click', () => {
      this.emit('double-click')
    })
  }

  setStyle(style: 'modern' | 'classic') {
    console.log('setStyle: ', style, this.style)
    if (this.style === style) {
      return
    }
    this.style = style
    this.emit('style-changed', style)
    if (style === 'classic') {
      this.tray.removeAllListeners()
      if (this.status) {
        this.menuChange(this.status)
      }
    } else {
      this.tray.setContextMenu(null)
    }
  }

  menuChange(status: TrayState) {
    this.status = status
    if (this.style !== 'classic') {
      return
    }
    this.iconChange(status.groupIsRunning)
    const menus: MenuItemConstructorOptions[] = []
    menus.push({
      label: status.groupIsRunning ? I18nT('common.state.running') : I18nT('tray.notRun'),
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

    const startupGroups = status?.startupGroups ?? []
    const service = status?.service ?? []

    for (const group of startupGroups) {
      menus.push({
        label: group.name,
        type: 'normal',
        enabled: !group.disabled && !group.running,
        icon: group.run ? this.runIcon : this.stopIcon,
        click: () => {
          this.emit('action', 'startupGroupDo', group.id)
        }
      })
    }

    if (startupGroups.length > 0 && service.length > 0) {
      menus.push({ type: 'separator' })
    }

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

    if (startupGroups.length > 0 || service.length > 0) {
      menus.push({ type: 'separator' })
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

  onBlur(event: Event) {
    event.preventDefault()
    if (!this.clicking) {
      this.closePopup()
    }
  }

  /**
   * 绑定新建的弹窗窗口。新窗口没有预热过,primed 必须一起重置——托盘样式切换
   * (modern→classic→modern)会销毁并重建窗口,旧标志会让新窗口跳过屏外预热、淡入复活。
   */
  attachWindow(win: BrowserWindow) {
    this.window = win
    this.primed = false
    this.show = false
    this.clicking = false
  }

  /**
   * 透明窗口每次 hidden→visible 都会被 Windows 重放一次约 300ms 的整窗淡入(与 DOM 无关,
   * 无法用 CSS 或 DWMWA_TRANSITIONS_FORCEDISABLED 去掉)。所以弹窗窗口创建后先在屏幕外
   * show 一次,把这次淡入消耗在看不见的地方;之后只靠移动进出屏幕,不再 hide/show。
   */
  primePopupWindow() {
    const win = this.window
    if (!win || win.isDestroyed() || this.primed) {
      return
    }
    this.primed = true
    const park = this.parkPosition()
    win.setPosition(park.x, park.y)
    win.setOpacity(0)
    win.showInactive()
  }

  /** 打开弹窗:窗口一直"显示"着停在屏幕外,这里只移动位置、置顶并恢复不透明 */
  openPopup(x: number, y: number) {
    const win = this.window
    if (!win || win.isDestroyed()) {
      return
    }
    win.setPosition(Math.round(x), Math.round(y))
    win.setAlwaysOnTop(true, 'screen-saver')
    win.moveTop()
    win.setOpacity(1)
    if (!win.isVisible()) {
      win.show()
    }
    // 移动/改透明度都不会激活窗口,必须显式取焦点,否则"点弹窗外面自动关"的 blur 永远不会触发
    win.focus()
    this.show = true
    this.clicking = true
    win.removeListener('blur', this.onBlur)
    setTimeout(() => {
      if (!this.show || win.isDestroyed()) {
        return
      }
      // 先摘再挂:250ms 内快速关→开会叠加多个定时器,避免 onBlur 被注册多份
      win.removeListener('blur', this.onBlur)
      win.on('blur', this.onBlur)
      this.clicking = false
    }, 250)
  }

  /** 关闭弹窗:移回屏幕外并置全透明,不能 hide,否则下次显示会再淡入一次 */
  closePopup() {
    const win = this.window
    this.show = false
    if (!win || win.isDestroyed()) {
      return
    }
    const park = this.parkPosition()
    win.setOpacity(0)
    win.setPosition(park.x, park.y)
    win.removeListener('blur', this.onBlur)
    if (win.isFocused()) {
      // 窗口只是移出屏幕、并没有 hide,不主动交还焦点的话它会一直攥着键盘输入
      win.blur()
    }
  }

  /** 屏幕外停放点:所有显示器包围盒之外的左上角 */
  private parkPosition() {
    const displays = screen.getAllDisplays()
    const minX = Math.min(...displays.map((d) => d.bounds.x))
    const minY = Math.min(...displays.map((d) => d.bounds.y))
    const width = this.window?.getBounds().width ?? 270
    return { x: Math.round(minX - width - 100), y: Math.round(minY) }
  }

  handleTrayClick = (event: any) => {
    event?.preventDefault?.()
    this.clicking = true
    this.window?.removeListener('blur', this.onBlur)
    const { x, y, side, arrowOffset } = this.resolvePlacement()
    this.emit('click', x, y, arrowOffset, !this.show, side)
  }

  /** 弹窗相对图标的方向与箭头偏移,供显示前先把布局同步给渲染层 */
  getPopupLayout() {
    const { side, arrowOffset } = this.resolvePlacement()
    return { side, arrowOffset }
  }

  private resolvePlacement(): TrayPopupPlacement {
    const trayBounds = this.tray.getBounds()
    const windowBounds = this.window?.getBounds()
    const size = { width: windowBounds?.width ?? 270, height: windowBounds?.height ?? 435 }
    const centerX = trayBounds.x + trayBounds.width * 0.5
    const centerY = trayBounds.y + trayBounds.height * 0.5
    // 图标可能在副屏上,定位与边界判断都要基于图标所在的显示器
    const display = screen.getDisplayNearestPoint({
      x: Math.round(centerX),
      y: Math.round(centerY)
    })
    const side = this.getPopupSide(display, trayBounds)
    const placement = this.getPopupPlacement(display, side, trayBounds, size)
    logger.info(
      `[tray] popup ${placement.side} x=${placement.x} y=${placement.y} arrow=${placement.arrowOffset}` +
        ` icon=${trayBounds.x},${trayBounds.y},${trayBounds.width},${trayBounds.height}`
    )
    return placement
  }

  /**
   * 托盘图标落在 workArea 之外的那一侧,就是任务栏所在边,弹窗要朝相反方向展开。
   * 任务栏自动隐藏时 workArea 与屏幕一致,四条边都探测不到,只能按图标所在半屏兜底:
   * 这种情况下垂直任务栏(图标挤在屏幕角落,与上下边的距离往往更近)会被当作水平处理,
   * 弹窗开在图标上/下方而不是侧面——已知不处理,角落位置本身也无法可靠区分方向。
   */
  private getPopupSide(display: Display, trayBounds: Rectangle): TrayPopupSide {
    const { workArea } = display
    const areaRight = workArea.x + workArea.width
    const areaBottom = workArea.y + workArea.height
    if (trayBounds.y < workArea.y) {
      return 'down'
    }
    if (trayBounds.y + trayBounds.height > areaBottom) {
      return 'up'
    }
    if (trayBounds.x < workArea.x) {
      return 'right'
    }
    if (trayBounds.x + trayBounds.width > areaRight) {
      return 'left'
    }
    const { bounds } = display
    return trayBounds.y + trayBounds.height * 0.5 < bounds.y + bounds.height * 0.5 ? 'down' : 'up'
  }

  private getPopupPlacement(
    display: Display,
    side: TrayPopupSide,
    trayBounds: Rectangle,
    size: { width: number; height: number }
  ): TrayPopupPlacement {
    const horizontal = side === 'up' || side === 'down'
    // 首选方向放不下时借另一个方向:上下互为备选,左右任务栏则退回图标上方/下方
    const candidates: TrayPopupSide[] = horizontal
      ? [side, side === 'up' ? 'down' : 'up']
      : [side, 'up', 'down']
    for (const candidate of candidates) {
      const placement = this.buildPlacement(display, candidate, trayBounds, size)
      if (placement.fits) {
        return placement
      }
    }
    // 可用区比弹窗还小时哪个方向都放不下,退到首选方向并贴住可用区上/左边缘,
    // 保证不会被整体挤到屏幕之外(另一侧放不下只能超出屏幕,窗口尺寸固定无法再缩)
    const { workArea } = display
    const areaBottom = workArea.y + workArea.height
    const fallback = this.buildPlacement(display, side, trayBounds, size)
    return {
      ...fallback,
      y: Math.round(
        Math.min(Math.max(fallback.y, workArea.y), Math.max(workArea.y, areaBottom - size.height))
      )
    }
  }

  private buildPlacement(
    display: Display,
    side: TrayPopupSide,
    trayBounds: Rectangle,
    size: { width: number; height: number }
  ): TrayPopupPlacement {
    const { workArea } = display
    const areaRight = workArea.x + workArea.width
    const areaBottom = workArea.y + workArea.height
    const centerX = trayBounds.x + trayBounds.width * 0.5
    const centerY = trayBounds.y + trayBounds.height * 0.5
    const clamp = (value: number, min: number, max: number) =>
      Math.round(Math.min(Math.max(value, min), Math.max(min, max)))

    if (side === 'up' || side === 'down') {
      // 与图标同列:水平居中对齐图标,箭头横向对准图标中心
      const x = clamp(centerX - size.width * 0.5, workArea.x, areaRight - size.width)
      const y =
        side === 'up'
          ? trayBounds.y - size.height - 10
          : Math.max(trayBounds.y + trayBounds.height, workArea.y)
      const arrowOffset = clamp(centerX - x - 6, 15, size.width - 21)
      const fits = side === 'up' ? y >= workArea.y : y + size.height <= areaBottom
      return { x, y: Math.round(y), side, arrowOffset, fits }
    }
    // 与图标同一行:垂直居中对齐图标,箭头纵向对准图标中心
    const x = side === 'right' ? workArea.x : areaRight - size.width
    const y = clamp(centerY - size.height * 0.5, workArea.y, areaBottom - size.height)
    const arrowOffset = clamp(centerY - y - 6, 15, size.height - 21)
    const fits =
      (side === 'right' ? x + size.width <= areaRight : x >= workArea.x) &&
      areaBottom - size.height >= workArea.y
    return { x, y, side, arrowOffset, fits }
  }

  destroy() {
    this.tray.removeAllListeners()
    this.tray.setContextMenu(null)
    this.tray.destroy()
  }
}
