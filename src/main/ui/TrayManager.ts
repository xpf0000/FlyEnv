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
  window: BrowserWindow | undefined
  private lastBlurCloseAt: number = 0
  private alwaysOnTopArmed: boolean = false
  private layoutNonce: number = 0
  private layoutAppliedResolver: (() => void) | undefined
  // 弹窗的设计尺寸(WindowManager 创建窗口时也是 270x435),任何 DPI 下 DIP 尺寸都恒定。
  // 定位/移动都必须用这个常量:Win11 分数缩放下裸 setPosition 每次调用都会让窗口
  // 膨胀 1~2px,弹窗会越开越大;现读 getBounds() 则会把系统取整抖动反馈进定位。
  // 每次打开都 setBounds 钉回设计尺寸,DPI 变化造成的漂移也会自动纠正
  private popupSize = { width: 270, height: 435 }

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
      this.lastBlurCloseAt = Date.now()
      this.closePopup()
    }
  }

  /**
   * 绑定新建的弹窗窗口。托盘样式切换(modern→classic→modern)会销毁并重建窗口,
   * 状态标志必须一起重置。新窗口先置全透明:openPopup 里 hidden→visible 的
   * 系统淡入只对透明度 0 的窗口播放,首次打开也不能例外
   */
  attachWindow(win: BrowserWindow) {
    this.window = win
    this.show = false
    this.clicking = false
    this.alwaysOnTopArmed = false
    win.setOpacity(0)
  }

  /** 打开弹窗:先等渲染层应用布局,再在全透明状态下完成移动/置顶/取焦点,
   * 最后恢复不透明——用户看到的第一帧就是最终状态,箭头跳变和焦点闪烁都被掩盖 */
  async openPopup(x: number, y: number, side: TrayPopupSide, arrowOffset: number) {
    const win = this.window
    if (!win || win.isDestroyed()) {
      return
    }
    // 先置意图标志:布局回执是异步的,期间再次点击会得到正确的"关闭"切换
    this.show = true
    this.clicking = true
    win.removeListener('blur', this.onBlur)
    // 等渲染层真正应用了方向/箭头再显示;直接发 IPC 不等回执的话,窗口可见后
    // 布局才落地,箭头会以旧位置渲染一帧再跳变(肉眼可见的"闪一下")
    await this.syncPopupLayout(side, arrowOffset)
    if (!this.show || win.isDestroyed()) {
      // 等待期间已被关闭(快速切换),放弃本次打开
      return
    }
    // setBounds 把尺寸钉回设计值:裸 setPosition 在 Win11 分数缩放下每次调用
    // 都让窗口膨胀 1~2px,弹窗会越开越大
    win.setBounds({ x: Math.round(x), y: Math.round(y), ...this.popupSize })
    if (!this.alwaysOnTopArmed) {
      // 置顶只需设置一次,每次重设都在挑动 z-order,可能引入额外闪烁
      win.setAlwaysOnTop(true, 'screen-saver')
      this.alwaysOnTopArmed = true
    }
    win.moveTop()
    if (!win.isVisible()) {
      // Windows 会对透明窗口的 hidden→visible 重放约 300ms 整窗淡入。窗口 hide 前
      // 已置为全透明(见 closePopup),这次淡入在不可见状态下播放,对用户无感
      win.show()
    }
    // 移动/显示都不保证激活窗口,必须显式取焦点,否则"点弹窗外面自动关"的 blur
    // 永远不会触发;焦点切换放在恢复不透明之前,激活瞬间的闪烁不可见
    win.focus()
    // 淡入作用于透明度 0 的窗口,这里恢复不透明,弹窗直接出现
    win.setOpacity(1)
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

  /**
   * 关闭弹窗:必须真正 hide。不能只用 setOpacity(0)/移出屏幕"伪隐藏"——
   * 透明度为 0 的窗口依然存在且会拦截鼠标点击,系统还可能在显示器变化时把它
   * 拉回屏内,表现为屏幕左上角一块区域点不动(issue #869)。
   * hide 前先置全透明:Windows 会在下次 show() 时重放整窗淡入,淡入作用于
   * 透明度 0 的窗口用户不可见,openPopup 再恢复不透明
   */
  closePopup() {
    const win = this.window
    this.show = false
    if (!win || win.isDestroyed()) {
      return
    }
    win.removeListener('blur', this.onBlur)
    if (win.isFocused()) {
      // 主动交还焦点,避免隐藏前窗口一直攥着键盘输入
      win.blur()
    }
    win.setOpacity(0)
    win.hide()
  }

  handleTrayClick = (event: any) => {
    event?.preventDefault?.()
    if (!this.show && Date.now() - this.lastBlurCloseAt < 350) {
      // Windows 下弹窗打开时点击图标会先触发 blur(已自动关窗)再触发 click,
      // 此时 this.show 已为 false,若照常处理会把刚关掉的弹窗立刻重新打开
      return
    }
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

  /** 把方向/箭头一次性推给渲染层(dom-ready 预热用,不等回执) */
  pushPopupLayout() {
    const { side, arrowOffset } = this.getPopupLayout()
    this.sendPopupLayout(side, arrowOffset)
  }

  /** 渲染层已应用最新布局的回执,由 IPCHandler 转发 */
  notifyLayoutApplied(nonce: number) {
    if (nonce === this.layoutNonce) {
      this.layoutAppliedResolver?.()
      this.layoutAppliedResolver = undefined
    }
  }

  /** 发送布局并等待渲染层回执;回执丢失时按超时兜底,绝不卡住打开流程 */
  private syncPopupLayout(side: TrayPopupSide, arrowOffset: number): Promise<void> {
    if (!this.sendPopupLayout(side, arrowOffset)) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.layoutAppliedResolver = undefined
        resolve()
      }, 150)
      this.layoutAppliedResolver = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  private sendPopupLayout(side: TrayPopupSide, arrowOffset: number): boolean {
    const win = this.window
    if (!win || win.isDestroyed()) {
      return false
    }
    this.layoutNonce += 1
    win.webContents.send('command', 'APP:Tray-Popup-Layout', 'APP:Tray-Popup-Layout', {
      side,
      arrowOffset,
      nonce: this.layoutNonce
    })
    return true
  }

  private resolvePlacement(): TrayPopupPlacement {
    const trayBounds = this.tray.getBounds()
    // 尺寸不能用 getBounds() 现读:系统取整后的实际值会随位置/DPI 抖动,
    // 用它定位会自我放大误差;统一用设计尺寸,与实际渲染最多差 1px,不可感知
    const size = this.popupSize
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
