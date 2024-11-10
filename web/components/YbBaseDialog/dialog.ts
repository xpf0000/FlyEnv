import { markRaw, toRaw } from 'vue'
import DialogView from './index.vue'
import { VueExtend } from '@web/VueExtend'

class BaseDialog {
  private _component: any
  private _resolve: Function | undefined
  private _componentData: Object
  private _dialogWidth: string
  private _dialogClassName: string
  private _dialogTitle: string
  private _dialogFooter: undefined | boolean

  constructor(component: any) {
    this._component = component
    this._componentData = {}
    this._dialogWidth = '50%'
    this._dialogClassName = ''
    this._dialogTitle = '弹窗标题'
    this._dialogFooter = undefined
  }

  /**
   * 传递给内部页面的数据
   * @param d
   * @returns {Dialog}
   */
  data(d: Object) {
    this._componentData = d
    return this
  }

  /**
   * 弹窗宽度
   * @param w
   * @returns {Dialog}
   */
  width(w: string) {
    this._dialogWidth = w
    return this
  }

  /**
   * 弹窗附加的类名
   * @param c
   * @returns {Dialog}
   */
  className(c: string) {
    this._dialogClassName = c
    return this
  }

  /**
   * 弹窗标题
   * @param t
   * @returns {Dialog}
   */
  title(t: string) {
    this._dialogTitle = t
    return this
  }

  /**
   * 不显示底部按钮
   * @returns {Dialog}
   */
  noFooter() {
    this._dialogFooter = false
    return this
  }

  /**
   * 显示弹窗
   * @returns {Dialog}
   */
  show() {
    const document = window.document
    let dom: HTMLElement | null = document.createElement('div')
    dom.style.position = 'relative'
    dom.style.zIndex = '2000'
    document.body.appendChild(dom)
    this._component.then((res: any) => {
      const view = res.default
      // 弹窗标题 优先级 方法设置 > 页面设置
      const title = view.title ?? this._dialogTitle ?? '弹窗标题'
      // 是否显示底部按钮 默认显示 优先级 方法设置 > 页面设置
      const footer = this._dialogFooter ?? view.dialogFooterShow ?? true
      const opt = {
        show: true,
        footerShow: footer,
        title: title,
        component: markRaw(toRaw(view)),
        data: this._componentData,
        width: this._dialogWidth,
        className: this._dialogClassName
      }
      let vm = VueExtend(DialogView, opt) as any
      const intance = vm.mount(dom!) as any
      intance.onClosed = () => {
        vm.unmount()
        vm = null
        dom?.remove()
        dom = null
      }
      intance.callBack = (res: any, close = true) => {
        if (close) {
          intance.close()
        }
        this._resolve && this._resolve(toRaw(res))
      }
    })
    return this
  }

  /**
   * 弹窗回调方法
   * @param callBack
   * @returns {Dialog}
   */
  then(callBack: Function) {
    this._resolve = callBack
    return this
  }
}
export default BaseDialog
