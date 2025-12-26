import type { Rect } from './app'
import { reactiveBind } from '@/util/Index'
import { CapturerStore } from './app'
// 首先，在你的类中需要定义一些必要的属性
class RectSelect {
  // 选区数据
  public editRect: Rect | undefined

  public selectAble: boolean = true

  public selected: boolean = false
  // 状态标志
  private isSelecting: boolean = false

  private beginPoint: { x: number; y: number } = { x: 0, y: 0 }

  // 初始化事件监听
  public initEvents() {
    window.addEventListener('mousedown', this.onMouseDown)
    // 防止默认拖拽行为
    window.addEventListener('dragstart', (e) => e.preventDefault())
  }

  /**
   * 鼠标按下开始选区
   */
  private onMouseDown(e: MouseEvent) {
    if (!this.selectAble || this.selected) {
      return
    }
    e.preventDefault()

    this.beginPoint = {
      x: e.clientX,
      y: e.clientY
    }

    this.isSelecting = true
    this.editRect = {
      x: e.clientX,
      y: e.clientY,
      width: 0,
      height: 0
    }

    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)

    // 可以在这里触发开始选区的回调
    console.log('开始选区', this.editRect)
  }

  /**
   * 鼠标移动更新选区
   */
  private onMouseMove(e: MouseEvent) {
    if (!this.selectAble || !this.isSelecting || !this.editRect) return
    e.preventDefault()
    const x = Math.max(0, Math.min(window.innerWidth, e.clientX))
    const y = Math.max(0, Math.min(window.innerHeight, e.clientY))

    this.updateEditRect(x, y)
  }

  /**
   * 鼠标释放结束选区
   */
  private onMouseUp(e: MouseEvent) {
    if (!this.selectAble || !this.isSelecting || !this.editRect) return

    e.preventDefault()

    this.isSelecting = false

    const x = Math.max(0, Math.min(window.innerWidth, e.clientX))
    const y = Math.max(0, Math.min(window.innerHeight, e.clientY))

    this.updateEditRect(x, y)

    CapturerStore().magnifyingInfo.show = false
    this.selected = true
    // 可以在这里触发选区完成的回调
    console.log('选区完成', this.editRect)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }

  /**
   * 更新选区数据，处理所有方向的反转
   */
  private updateEditRect(currentX: number, currentY: number) {
    if (!this.editRect) return

    const startX = this.beginPoint.x
    const startY = this.beginPoint.y

    // 计算宽高（可能是负数，表示反方向拖拽）
    const width = currentX - startX
    const height = currentY - startY

    // 自动处理四个方向的选区
    let x = startX
    let y = startY

    // 如果宽度为负，表示向左拖拽，x坐标需要调整
    if (width < 0) {
      x = startX + width // width是负数
    }

    // 如果高度为负，表示向上拖拽，y坐标需要调整
    if (height < 0) {
      y = startY + height // height是负数
    }

    this.editRect.x = x
    this.editRect.y = y
    this.editRect.width = Math.abs(width)
    this.editRect.height = Math.abs(height)
  }
}
const selector = reactiveBind(new RectSelect())
selector.initEvents()
export default selector
