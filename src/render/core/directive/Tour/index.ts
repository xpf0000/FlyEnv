import { createApp, reactive, App } from 'vue'
import Poper from './wapper.vue'
import Mask from './mask.vue'

class TourItemClass {
  $el: HTMLElement
  component: any
  index: number
  title?: string
  position?: 'bottom' | 'top' | 'left' | 'right'
  onNext?: Function
  onPre?: Function
  onShow?: Function

  constructor($el: HTMLElement, index: number, component: any) {
    this.$el = $el
    this.index = index
    this.component = component
  }
}

class TourGroupClass {
  index: number
  item: { [key: string]: TourItemClass }
  count: number

  constructor() {
    this.index = 0
    this.item = {}
    this.count = 0
  }

  end(): void {
    TourCenter.hide()
  }
  next(): void {
    if (this.index < this.count - 1) {
      const item = this.item?.[this.index]
      if (item?.onNext) {
        item.onNext(item).then(() => {
          this.index += 1
        })
      } else {
        this.index += 1
      }
    }
  }
  pre(): void {
    if (this.index > 0) {
      const item = this.item?.[this.index]
      if (item?.onPre) {
        item.onPre(item).then(() => {
          this.index -= 1
        })
      } else {
        this.index -= 1
      }
    }
  }
}

class TourClass {
  mask?: HTMLElement
  poper?: HTMLElement
  currentGroup?: TourGroupClass
  poperVM?: App
  maskVM?: App
  group: { [p: string]: TourGroupClass }
  rect?: DOMRect
  updateRect?: Function

  private endCallBack?: Function

  constructor() {
    this.group = {}
  }

  onHide(cb: Function) {
    this.endCallBack = cb
  }

  groupShow(key: string) {
    if (!this.group?.[key]) {
      this.group[key] = reactive(new TourGroupClass())
    }
    this.currentGroup = this.group?.[key]
    if (this.currentGroup) {
      this.initDom()
    }
  }

  initDom() {
    if (!this?.mask) {
      const dom = document.createElement('div')
      dom.className = 'vue-tour-mask-wapper'
      this.mask = dom
      document.body.appendChild(this.mask)
    }
    if (!this?.poper) {
      const dom = document.createElement('div')
      dom.className = 'vue-tour-wapper'
      dom.style.display = 'none'
      this.poper = dom
      document.body.appendChild(this.poper)
    }

    this.maskVM = createApp(Mask)
    this.maskVM.mount(this.mask)

    this.poperVM = createApp(Poper)
    const vm = this.poperVM.mount(this.poper)
    console.log('poperVM: ', this.poperVM, vm)
  }

  hide() {
    this?.poperVM?.unmount()
    this?.poper?.remove()
    this?.maskVM?.unmount()
    this?.mask?.remove()
    this.endCallBack && this.endCallBack()
  }
}

export const TourCenter = reactive(new TourClass())

interface Props {
  group: string
  index: number
  count: number
  component: any
  title?: string
  position?: 'bottom' | 'top' | 'left' | 'right'
  onPre?: Function
  onNext?: Function
  onShow?: Function
}

const addOrUpdate = (el: HTMLElement, value: Props) => {
  const groupName = value.group
  if (!TourCenter.group?.[groupName]) {
    TourCenter.group[groupName] = reactive(new TourGroupClass())
  }

  const group = TourCenter.group[groupName]
  group.count = value.count

  const index = value.index
  const item = reactive(new TourItemClass(el, index, value.component))
  item.title = value?.title
  item.position = value?.position
  item.onPre = value?.onPre
  item.onNext = value?.onNext
  item.onShow = value?.onShow

  group.item[index] = item
}

const install = function (Vue: any) {
  Vue.directive('tour', {
    mounted(el: HTMLElement, { value }: { value: Props }) {
      addOrUpdate(el, value)
    },
    updated(el: HTMLElement, { value }: { value: Props }) {
      addOrUpdate(el, value)
    }
  })
}

export default install
