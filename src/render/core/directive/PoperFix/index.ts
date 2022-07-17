import type { App } from 'vue'
import { nextTick } from 'vue'

const install = function (Vue: App) {
  Vue.directive('poperFix', {
    updated(el: HTMLElement) {
      nextTick().then(() => {
        const poper = el.parentNode as HTMLElement
        const style = getComputedStyle(poper)
        const display = style.display
        if ('block' === display) {
          const rect = poper.getBoundingClientRect()
          const rectBody = document.body.getBoundingClientRect()
          if (rect.bottom > rectBody.bottom) {
            poper.style.top = `${rectBody.bottom - rect.bottom - 10}px`
            const arrow = poper.querySelector('.el-popper__arrow') as HTMLElement
            arrow.style.display = 'none'
          }
        }
      })
    }
  })
}

export default install
