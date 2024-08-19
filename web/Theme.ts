import { AppStore } from '@web/store/app'
import { computed, watch, ref } from 'vue'

export const ThemeInit = () => {
  const store = AppStore()
  const index = ref(0)

  const theme = computed(() => {
    if (index.value < 0) {
      return ''
    }
    const t = store?.config?.setup?.theme
    console.log('theme: ', t)
    if (!t || t === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark'
      }
      return 'light'
    }
    return t
  })
  const resetHtmlThemeTag = () => {
    const html = document.documentElement
    html.classList.remove('dark', 'light')
    html.classList.add(theme.value)
  }
  resetHtmlThemeTag()

  watch(theme, () => {
    resetHtmlThemeTag()
  })

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    index.value += 1
    resetHtmlThemeTag()
  })
}
