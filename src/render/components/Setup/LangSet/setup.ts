import { reactive } from 'vue'
import { initCustomerLang, loadCustomerLang } from '@lang/loader'

const { shell } = require('@electron/remote')
const { resolve } = require('path')

export const LangSetup = reactive({
  loading: false,
  async doLoad() {
    if (this.loading) {
      return
    }
    this.loading = true
    await loadCustomerLang()
    this.loading = false
  },
  async openLangDir() {
    await initCustomerLang()
    const langDir = resolve(global.Server.BaseDir!, '../lang')
    shell.openPath(langDir).then().catch()
  }
})
