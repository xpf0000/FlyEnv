import * as Vue from 'vue'
const pending = new Map<string, (...args: any[]) => void>()
const ipc = {
  sendSensitive(command: string, ...args: any[]) {
    const key = crypto.randomUUID()
    ;(window as any).FlyEnvNodeAPI.send(command, key, ...args)
    return { key, then: (callback: (...args: any[]) => void) => pending.set(key, callback) }
  },
  off(key: string) {
    pending.delete(key)
  }
}
;(window as any).FlyEnvNodeAPI.receive((_command: string, key: string, response: any) =>
  pending.get(key)?.(key, response)
)
;(globalThis as any).__FLYENV_PLUGIN_HOST__ = { vue: Vue, ipc }
;(window as any).fixtureIPC = (command: string, ...args: any[]) =>
  new Promise((resolve) => {
    ipc.sendSensitive(command, ...args).then((key, response) => {
      if (response?.code === 200) return
      ipc.off(key)
      resolve(response)
    })
  })
;(window as any).mountFixture = async (code: string) => {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    const module = await import(url)
    Vue.createApp(module.default.index).mount('#fixture')
  } finally {
    URL.revokeObjectURL(url)
  }
}
