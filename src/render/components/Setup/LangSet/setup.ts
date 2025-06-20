import { reactive } from 'vue'
import { lang } from '@/util/NodeFn'
import { resolve } from '@/util/path-browserify'
import { shell } from '@/util/NodeFn'

export const LangSetup = reactive({
  loading: false,
  async doLoad() {
    if (this.loading) {
      return
    }
    this.loading = true
    await lang.loadCustomerLang()
    this.loading = false
  },
  async openLangDir() {
    await lang.initCustomerLang()
    const langDir = resolve(window.Server.BaseDir!, '../lang')
    shell.openPath(langDir).then().catch()
  }
})
