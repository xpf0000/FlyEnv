import { reactive } from 'vue'
import { lang } from '@/util/NodeFn'
import { resolve } from '@/util/path-browserify'
import { shell } from '@/util/NodeFn'
import { CustomerLangs } from '@lang/customer'
import { AppAllLang } from '@lang/index'
import { AppStore } from '@/store/app'
import { RendererLanguage } from '@/core/LanguageService'

export const LangSetup = reactive({
  loading: false,
  async doLoad() {
    if (this.loading) {
      return
    }
    this.loading = true
    try {
      const items = await lang.listCustom()
      CustomerLangs.splice(
        0,
        CustomerLangs.length,
        ...items.map((item) => ({ label: item.label, lang: item.locale }))
      )
      const currentLocale = AppStore().config.setup.lang
      if (
        !Object.hasOwn(AppAllLang, currentLocale) &&
        items.some((item) => item.locale === currentLocale)
      ) {
        await lang.invalidate(currentLocale)
        await RendererLanguage.switchLocale(currentLocale)
      }
    } finally {
      this.loading = false
    }
  },
  async openLangDir(locale: string) {
    await lang.initCustom(locale === 'zh' ? 'zh' : 'en')
    const langDir = resolve(window.Server.BaseDir!, '../lang')
    await shell.openPath(langDir)
  }
})
