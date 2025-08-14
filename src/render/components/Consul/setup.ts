import { reactive } from 'vue'
import localForage from 'localforage'

export const ConsulSetup: {
  dir: Record<string, string>
  init: () => void
  save: () => void
} = reactive({
  dir: {},
  init() {
    localForage
      .getItem('flyenv-consul-storage-dir')
      .then((res: Record<string, string>) => {
        if (res) {
          ConsulSetup.dir = reactive(res)
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem('flyenv-consul-storage-dir', JSON.parse(JSON.stringify(ConsulSetup.dir)))
      .then()
      .catch()
  }
})
