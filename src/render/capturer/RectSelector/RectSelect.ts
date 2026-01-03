import type { Rect } from '../store/app'
import { reactiveBind } from '@/util/Index'
import { CapturerStore } from '../store/app'
import CapturerTool from '@/capturer/tools/tools'
import IPC from '@/util/IPC'
// 首先，在你的类中需要定义一些必要的属性
class RectSelect {
  // 选区数据
  public editRect: Rect | undefined | null

  public selectAble: boolean = true

  public selected: boolean = false
  // 状态标志
  private isSelecting: boolean = false

  private beginPoint: { x: number; y: number } = { x: 0, y: 0 }

  private moved: boolean = false

  editRectId: number | null = null

  reinit() {
    this.editRect = null
    this.editRectId = null
    this.selectAble = true
    this.selected = false
    this.isSelecting = false
    this.beginPoint = {
      x: 0,
      y: 0
    }
    this.moved = false
  }

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
      console.log('onMouseDown exit !!!', this.selectAble, this.selected)
      return
    }
    e.preventDefault()
    this.moved = false
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
    console.log('开始选区', this.editRect, e.clientX, e.clientY)
  }

  /**
   * 鼠标移动更新选区
   */
  private onMouseMove(e: MouseEvent) {
    if (!this.selectAble || !this.isSelecting || !this.editRect) return
    e.preventDefault()
    if (e.clientX !== this.beginPoint.x && e.clientY !== this.beginPoint.y) {
      this.moved = true
    }
    console.log('onMouseMove !!!', e.clientX, e.clientY)
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
    const store = CapturerStore()
    console.log(
      'onMouseUp this.moved: ',
      this.moved,
      store?.currentRect?.bounds,
      store?.currentRect?.id
    )
    if (!this.moved && store?.currentRect?.bounds) {
      const rect = store.currentRect.bounds
      if (
        e.clientX >= rect.x &&
        e.clientY >= rect.y &&
        e.clientX <= rect.x + rect.width &&
        e.clientY <= rect.y + rect.height
      ) {
        this.editRect = null
        this.chooseHoverRect()
        window.removeEventListener('mousemove', this.onMouseMove)
        window.removeEventListener('mouseup', this.onMouseUp)
        return
      }
    }
    this.moved = false
    const x = Math.max(0, Math.min(window.innerWidth, e.clientX))
    const y = Math.max(0, Math.min(window.innerHeight, e.clientY))

    this.updateEditRect(x, y)

    CapturerStore().magnifyingInfo.show = false
    this.selected = true
    CapturerTool.updatePosition(this.editRect)
    // 可以在这里触发选区完成的回调
    console.log('选区完成', this.editRect)
    IPC.send('Capturer:stopCheckWindowInPoint').then((key: string) => {
      IPC.off(key)
    })
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }

  private chooseHoverRect() {
    IPC.send('Capturer:stopCheckWindowInPoint').then((key: string) => {
      IPC.off(key)
    })
    const store = CapturerStore()
    if (
      store?.currentRect?.id &&
      store?.currentRect?.id > 0 &&
      !store.windowImages?.[store?.currentRect?.id]
    ) {
      IPC.send('Capturer:getWindowCapturer', store?.currentRect?.id).then((key: string) => {
        IPC.off(key)
      })
    }
    store.magnifyingInfo.show = false
    this.editRect = {
      ...store.currentRect?.bounds
    } as any
    this.editRectId = store?.currentRect?.id ?? 0
    this.selectAble = false
    this.selected = true
    CapturerTool.updatePosition(this.editRect!)
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
