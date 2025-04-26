import { BrowserWindow, screen, Display } from 'electron'

class ScreenManager {
  // 配置常量
  private readonly SCREEN_SAFE_MARGIN = 50 // 屏幕边缘安全间距（像素）
  private readonly DEBOUNCE_TIME = 500 // 防抖时间（毫秒）

  // 状态管理
  private boundHandlers: { [event: string]: () => void } = {}
  private debounceTimer: NodeJS.Timeout | null = null
  private lastValidBounds?: { x: number; y: number; width: number; height: number }

  private window: BrowserWindow | undefined

  /**
   * 初始化显示器监听
   */
  initWatch() {
    this.boundHandlers['display-added'] = this.handleDisplayChange.bind(this)
    this.boundHandlers['display-removed'] = this.handleDisplayChange.bind(this)
    this.boundHandlers['display-metrics-changed'] = this.handleDisplayChange.bind(this)

    Object.entries(this.boundHandlers).forEach(([event, handler]) => {
      screen.on(event as any, handler)
    })
  }

  initWindow(window: BrowserWindow) {
    this.window = window
  }

  /**
   * 销毁监听（防止内存泄漏）
   */
  destroy() {
    Object.entries(this.boundHandlers).forEach(([event, handler]) => {
      screen.off(event as any, handler)
    })
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
  }

  /**
   * 处理显示器变化事件（防抖优化）
   */
  private handleDisplayChange() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.repositionAllWindows()
      this.debounceTimer = null
    }, this.DEBOUNCE_TIME)
  }

  /**
   * 重新定位所有窗口
   */
  repositionAllWindows() {
    if (!this.window) {
      return
    }
    if (!this.isWindowInSafeArea(this.window)) {
      this.safeReposition(this.window)
    }
  }

  /**
   * 安全重置窗口位置和尺寸
   */
  private safeReposition(win: BrowserWindow) {
    const display = this.getBestDisplayForWindow(win)
    if (!display) return

    // 1. 修正窗口尺寸
    const [maxWidth, maxHeight] = this.getMaxWindowSize(display)
    const [winWidth, winHeight] = win.getSize()

    const newWidth = Math.min(winWidth, maxWidth)
    const newHeight = Math.min(winHeight, maxHeight)

    // 2. 修正窗口位置
    const [x, y] = this.getSafePosition(win, display, newWidth, newHeight)

    // 3. 应用新尺寸和位置
    if (newWidth !== winWidth || newHeight !== winHeight) {
      win.setSize(newWidth, newHeight)
    }
    win.setPosition(x, y)

    // 记录最后有效位置
    this.lastValidBounds = { x, y, width: newWidth, height: newHeight }
  }

  /**
   * 检查窗口是否完全在安全区域内（任意部分超出即返回false）
   */
  private isWindowInSafeArea(win: BrowserWindow): boolean {
    const displays = screen.getAllDisplays()
    const [winX, winY] = win.getPosition()
    const [winWidth, winHeight] = win.getSize()

    // 窗口的四个角坐标
    const winCorners = [
      { x: winX, y: winY }, // 左上角
      { x: winX + winWidth, y: winY }, // 右上角
      { x: winX, y: winY + winHeight }, // 左下角
      { x: winX + winWidth, y: winY + winHeight } // 右下角
    ]

    // 检查所有角是否至少在一个显示器范围内
    for (const corner of winCorners) {
      let cornerInDisplay = false

      for (const display of displays) {
        const { x, y, width, height } = display.bounds
        if (corner.x >= x && corner.x <= x + width && corner.y >= y && corner.y <= y + height) {
          cornerInDisplay = true
          break
        }
      }

      // 如果任意一个角不在任何显示器内，则判定为不安全
      if (!cornerInDisplay) {
        return false
      }
    }

    // 所有角都在显示器内，记录最后有效位置
    this.lastValidBounds = {
      x: winX,
      y: winY,
      width: winWidth,
      height: winHeight
    }
    return true
  }

  /**
   * 获取窗口最适合的显示器
   */
  private getBestDisplayForWindow(win: BrowserWindow): Display | null {
    const displays = screen.getAllDisplays()
    if (displays.length === 0) return null

    const [winX, winY] = win.getPosition()
    const [winWidth, winHeight] = win.getSize()

    // 优先选择窗口中心点所在的显示器
    const winCenterX = winX + winWidth / 2
    const winCenterY = winY + winHeight / 2

    const displayContainingCenter = displays.find((display) => {
      const { x, y, width, height } = display.bounds
      return (
        winCenterX >= x && winCenterX <= x + width && winCenterY >= y && winCenterY <= y + height
      )
    })

    // 如果窗口中心不在任何显示器内，则选择与窗口重叠最多的显示器
    if (!displayContainingCenter) {
      let maxOverlap = 0
      let bestDisplay = displays[0]

      for (const display of displays) {
        const { x, y, width, height } = display.bounds
        const overlapX = Math.max(0, Math.min(winX + winWidth, x + width) - Math.max(winX, x))
        const overlapY = Math.max(0, Math.min(winY + winHeight, y + height) - Math.max(winY, y))
        const overlapArea = overlapX * overlapY

        if (overlapArea > maxOverlap) {
          maxOverlap = overlapArea
          bestDisplay = display
        }
      }
      return bestDisplay
    }

    return displayContainingCenter
  }

  /**
   * 计算窗口在当前显示器中的最大允许尺寸
   */
  private getMaxWindowSize(display: Display): [number, number] {
    const { workArea } = display
    return [
      workArea.width - this.SCREEN_SAFE_MARGIN * 2,
      workArea.height - this.SCREEN_SAFE_MARGIN * 2
    ]
  }

  /**
   * 计算安全的窗口位置
   */
  private getSafePosition(
    win: BrowserWindow,
    display: Display,
    winWidth: number,
    winHeight: number
  ): [number, number] {
    const { workArea } = display

    // 计算可用的位置范围
    const minX = workArea.x + this.SCREEN_SAFE_MARGIN
    const minY = workArea.y + this.SCREEN_SAFE_MARGIN
    const maxX = workArea.x + workArea.width - winWidth - this.SCREEN_SAFE_MARGIN
    const maxY = workArea.y + workArea.height - winHeight - this.SCREEN_SAFE_MARGIN

    // 尝试使用最后有效位置（如果存在且有效）
    if (this.lastValidBounds) {
      const { x, y } = this.lastValidBounds
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        return [x, y]
      }
    }

    // 默认居中显示
    const centerX = workArea.x + (workArea.width - winWidth) / 2
    const centerY = workArea.y + (workArea.height - winHeight) / 2

    return [
      Math.floor(Math.min(Math.max(centerX, minX), maxX)),
      Math.floor(Math.min(Math.max(centerY, minY), maxY))
    ]
  }
}

// 单例导出
export default new ScreenManager()
