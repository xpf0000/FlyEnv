import { onMounted, ref } from 'vue'
import type { SoftInstalled } from './store/brew'
import { I18nT } from '@shared/lang'
import { VueExtend } from './VueExtend'
import { AppStore } from './store/app'
import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import type { AllAppModule } from '@web/core/type'

export function random(m: number, n: number) {
  return Math.floor(Math.random() * (m - n) + n)
}

export const waitTime = () => {
  return new Promise((resolve) => {
    setTimeout(
      () => {
        resolve(true)
      },
      random(300, 1000)
    )
  })
}

const exec = (
  typeFlag: AllAppModule,
  version: SoftInstalled,
  fn: string
): Promise<string | boolean> => {
  return new Promise((resolve) => {
    if (version.running) {
      resolve(true)
      return
    }
    if (!version?.version) {
      resolve(I18nT('util.versionNoFound'))
      return
    }
    version.running = true
    waitTime().then(() => {
      version.run = fn !== 'stopService'
      version.running = false
      resolve(true)
    })
  })
}

export const stopService = (typeFlag: AllAppModule, version: SoftInstalled) => {
  return exec(typeFlag, version, 'stopService')
}

export const startService = (typeFlag: AllAppModule, version: SoftInstalled) => {
  return exec(typeFlag, version, 'startService')
}

export const reloadService = (typeFlag: AllAppModule, version: SoftInstalled) => {
  return exec(typeFlag, version, 'reloadService')
}

export const AsyncComponentShow = (compontent: any, data?: any) => {
  return new Promise((resolve) => {
    let dom: HTMLElement | null = document.createElement('div')
    document.body.appendChild(dom)
    const vm: any = VueExtend(compontent, data)
    const intance = vm.mount(dom)
    intance.onClosed(() => {
      intance?.$destroy && intance.$destroy()
      vm?.$destroy && vm.$destroy()
      dom && dom.remove()
      dom = null
    })
    intance.onSubmit((arg: any) => {
      intance.show = false
      resolve(arg)
    })
  })
}

export const AsyncComponentSetup = () => {
  const show = ref(false)
  let closedFn: Function = () => {}
  let callback: Function = () => {}
  const onClosed = (fn: Function) => {
    closedFn = fn
  }
  const onSubmit = (fn: Function) => {
    callback = fn
  }
  onMounted(() => {
    show.value = true
  })
  return {
    show,
    closedFn: () => {
      closedFn()
    },
    callback: (arg: any) => {
      callback(arg)
    },
    onClosed,
    onSubmit
  }
}

export function uuid(length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}

export const EditorConfigMake = (value: string, readOnly: boolean, wordWrap: 'off' | 'on') => {
  const appStore = AppStore()
  const editorConfig = AppStore().editorConfig
  let theme = editorConfig.theme
  if (theme === 'auto') {
    let appTheme = appStore?.config?.setup?.theme ?? ''
    console.log('appTheme: ', appTheme)
    if (!appTheme || appTheme === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        appTheme = 'dark'
      } else {
        appTheme = 'light'
      }
    }
    if (appTheme === 'light') {
      theme = 'vs-light'
    } else {
      theme = 'vs-dark'
    }
  }
  return {
    value,
    language: 'ini',
    readOnly,
    scrollBeyondLastLine: false,
    overviewRulerBorder: true,
    automaticLayout: true,
    wordWrap,
    theme: theme,
    fontSize: editorConfig.fontSize,
    lineHeight: editorConfig.lineHeight
  }
}

export const EditorCreate = (input: HTMLElement, config: any) => {
  return editor.create(input, config)
}

export const basename = (dir: string) => {
  return dir.split('/').pop()!
}
export const dirname = (dir: string) => {
  const arr = dir.split('/')
  arr.pop()
  return arr.join('/')
}

export const join = (...dirs: string[]) => {
  const all: string[] = []
  for (const dir of dirs) {
    const arr = dir.split('/').filter((s) => !!s.trim())
    all.push(...arr)
  }
  let str = all.join('/')
  if (dirs?.[0]?.startsWith('/')) {
    str = '/' + str
  }
  return str
}
