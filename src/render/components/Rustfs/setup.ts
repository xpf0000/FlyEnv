import { reactive } from 'vue'
import localForage from 'localforage'

export const RustfsSetup: {
  dir: Record<string, string>
  init: () => void
  save: () => void
} = reactive({
  dir: {},
  init() {
    localForage
      .getItem('flyenv-rustfs-storage-dir')
      .then((res: Record<string, string>) => {
        if (res) {
          RustfsSetup.dir = reactive(res)
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem('flyenv-rustfs-storage-dir', JSON.parse(JSON.stringify(RustfsSetup.dir)))
      .then()
      .catch()
  }
})
