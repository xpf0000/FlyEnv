import { clipboard } from '@/util/NodeFn'
import { VueExtend } from '@/core/VueExtend'
import { I18nT } from '@lang/index'
import { MariadbClusterManager } from './manager'
import { InstanceActionController } from './actionsController'

export const InstanceActions = new InstanceActionController({
  copy: (text) => clipboard.writeText(text),
  copied: () => I18nT('base.copySuccess'),
  notify: (type, message) => MariadbClusterManager.deps.notify(type, message),
  open: async (id, view) => {
    const component =
      view === 'manage' ? await import('./Manage/index.vue') : await import('./Files/index.vue')
    return new Promise<void>((resolve, reject) => {
      const element = document.createElement('div')
      document.body.appendChild(element)
      let app: ReturnType<typeof VueExtend> | undefined
      try {
        app = VueExtend(component.default, { id, view })
        const instance = app.mount(element) as any
        instance.onClosed(() => {
          app?.unmount()
          element.remove()
          resolve()
        })
        instance.onSubmit(() => {
          instance.show = false
        })
      } catch (error) {
        app?.unmount()
        element.remove()
        reject(error)
      }
    })
  }
})
