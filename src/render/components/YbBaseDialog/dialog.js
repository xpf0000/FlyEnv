import DialogView from './index.vue'
import { VueExtend } from '../../core/VueExtend.js'
import { markRaw, toRaw } from 'vue'
class BaseDialog {
  constructor(component) {
    this._component = component
    this._resolve = null
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
  data(d) {
    this._componentData = d
    return this
  }

  /**
   * 弹窗宽度
   * @param w
   * @returns {Dialog}
   */
  width(w) {
    this._dialogWidth = w
    return this
  }

  /**
   * 弹窗附加的类名
   * @param c
   * @returns {Dialog}
   */
  className(c) {
    this._dialogClassName = c
    return this
  }

  /**
   * 弹窗标题
   * @param t
   * @returns {Dialog}
   */
  title(t) {
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
    const document = window?.parent?.document ?? window.document
    let dom = document.createElement('div')
    dom.style.position = 'relative'
    dom.style.zIndex = '9999999'
    document.body.appendChild(dom)
    this._component.then((res) => {
      const view = res.default
      // 弹窗标题 优先级 方法设置 > 页面设置
      let title = view.title ?? this._dialogTitle ?? '弹窗标题'
      // 是否显示底部按钮 默认显示 优先级 方法设置 > 页面设置
      let footer = this._dialogFooter ?? view.dialogFooterShow ?? true
      let opt = {
        show: true,
        footerShow: footer,
        title: title,
        component: markRaw(toRaw(view)),
        data: this._componentData,
        width: this._dialogWidth,
        className: this._dialogClassName
      }
      let vm = VueExtend(DialogView, opt)
      let intance = vm.mount(dom)
      intance.onClosed = () => {
        dom.remove()
        dom = null
        vm.unmount()
        vm = null
      }
      intance.callBack = (res, close = true) => {
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
  then(callBack) {
    this._resolve = callBack
    return this
  }
}
export default BaseDialog
