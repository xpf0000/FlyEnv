import type { SoftInstalled } from './store/brew'
import { DnsStore } from './store/dns'
import { I18nT } from '@shared/lang'
import type { AllAppSofts } from './store/app'
import { VueExtend } from './VueExtend'
import { onMounted, ref } from 'vue'
import { AppStore } from './store/app'

export function random(m: number, n: number) {
  return Math.floor(Math.random() * (m - n) + n)
}

export const waitTime = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, random(300, 1000))
  })
}

const exec = (
  typeFlag: AllAppSofts,
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

export const stopService = (typeFlag: AllAppSofts, version: SoftInstalled) => {
  return exec(typeFlag, version, 'stopService')
}

export const startService = (typeFlag: AllAppSofts, version: SoftInstalled) => {
  return exec(typeFlag, version, 'startService')
}

export const reloadService = (typeFlag: AllAppSofts, version: SoftInstalled) => {
  return exec(typeFlag, version, 'reloadService')
}

export const dnsStart = (): Promise<boolean | string> => {
  return new Promise((resolve) => {
    const store = DnsStore()
    if (store.running) {
      resolve(true)
      return
    }
    store.fetching = true
    waitTime().then(() => {
      store.fetching = false
      store.running = true
      resolve(true)
    })
  })
}

export const dnsStop = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const store = DnsStore()
    if (!store.running) {
      resolve(true)
      return
    }
    store.fetching = true
    waitTime().then(() => {
      store.fetching = false
      store.running = false
      resolve(true)
    })
  })
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
  const editorConfig = AppStore().editorConfig
  return {
    value,
    language: 'ini',
    readOnly,
    scrollBeyondLastLine: false,
    overviewRulerBorder: true,
    automaticLayout: true,
    wordWrap,
    theme: editorConfig.theme,
    fontSize: editorConfig.fontSize,
    lineHeight: editorConfig.lineHeight
  }
}
