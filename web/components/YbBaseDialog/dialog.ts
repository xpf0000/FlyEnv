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
    this._dialogTitle = 'Dialog Title'
    this._dialogFooter = undefined
  }

  /**
   * Data passed to the internal page
   * @param d
   * @returns {Dialog}
   */
  data(d: Object) {
    this._componentData = d
    return this
  }

  /**
   * Dialog width
   * @param w
   * @returns {Dialog}
   */
  width(w: string) {
    this._dialogWidth = w
    return this
  }

  /**
   * Additional class name for the dialog
   * @param c
   * @returns {Dialog}
   */
  className(c: string) {
    this._dialogClassName = c
    return this
  }

  /**
   * Dialog title
   * @param t
   * @returns {Dialog}
   */
  title(t: string) {
    this._dialogTitle = t
    return this
  }

  /**
   * Do not show bottom buttons
   * @returns {Dialog}
   */
  noFooter() {
    this._dialogFooter = false
    return this
  }

  /**
   * Show dialog
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
      // Dialog title priority: method setting > page setting
      const title = view.title ?? this._dialogTitle ?? 'Dialog Title'
      // Whether to show the footer buttons, default is to show. Priority: method setting > page setting
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
   * Dialog callback method
   * @param callBack
   * @returns {Dialog}
   */
  then(callBack: Function) {
    this._resolve = callBack
    return this
  }
}
export default BaseDialog
