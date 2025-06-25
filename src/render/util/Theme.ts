import { AppStore } from '@/store/app'
import { watch, ref } from 'vue'
import { nativeTheme } from '@/util/NodeFn'
import { asyncComputed } from '@vueuse/core'

export const ThemeInit = () => {
  const store = AppStore()
  const index = ref(0)
  const theme = asyncComputed(async () => {
    if (index.value < 0) {
      return ''
    }
    const t = store?.config?.setup?.theme
    console.log('theme: ', t)
    if (!t || t === 'system') {
      const isDark = await nativeTheme.shouldUseDarkColors()
      return isDark ? 'dark' : 'light'
    }
    return t || 'light'
  })
  const resetHtmlThemeTag = () => {
    const html = document.documentElement
    html.classList.remove('dark', 'light')
    if (theme?.value) {
      html.classList.add(theme.value)
    }
  }
  resetHtmlThemeTag()

  watch(theme, () => {
    resetHtmlThemeTag()
  })

  nativeTheme.on('updated', () => {
    console.log('nativeTheme updated !!!')
    index.value += 1
    resetHtmlThemeTag()
  })
}
