import { AppStore } from '@/store/app'
import { computed, ref, watch } from 'vue'
import { nativeTheme } from '@/util/NodeFn'
import localForage from 'localforage'

export const AppUI = () => {
  const appStore = AppStore()

  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  watch(
    lang,
    (val) => {
      const body = document.body
      body.className = `lang-${val}`
    },
    {
      immediate: true
    }
  )

  const isDark = ref(false)
  nativeTheme.shouldUseDarkColors().then((e) => {
    isDark.value = e
  })
  const theme = computed(() => {
    const t = appStore?.config?.setup?.theme
    if (!t) {
      return isDark.value ? 'dark' : 'light'
    }
    return t
  })
  watch(
    theme,
    (val) => {
      localForage.setItem('flyenv-app-theme', val).catch()
    },
    {
      immediate: true
    }
  )

  // 界面字体和代码块字体: 通过 CSS 变量动态应用
  const appFont = computed(() => appStore.config.setup?.appFont || '')
  const codeFont = computed(() => appStore.config.setup?.codeFont || '')

  watch(
    appFont,
    (val) => {
      if (val) {
        document.documentElement.style.setProperty('--app-font', val)
        if (!codeFont.value) {
          document.documentElement.style.setProperty('--app-code-font', val)
        }
      } else {
        document.documentElement.style.removeProperty('--app-font')
        if (!codeFont.value) {
          document.documentElement.style.removeProperty('--app-code-font')
        }
      }
    },
    { immediate: true }
  )

  watch(
    codeFont,
    (val) => {
      document.documentElement.style.setProperty('--app-code-font', val || appFont.value)
    },
    { immediate: true }
  )
}
