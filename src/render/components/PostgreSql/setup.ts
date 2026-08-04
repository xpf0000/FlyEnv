import { reactive } from 'vue'
import localForage from 'localforage'

let initPromise: Promise<void> | undefined

export const PostgreSqlSetup: {
  dir: Record<string, string>
  init: () => Promise<void>
  save: () => void
} = reactive({
  dir: {},
  init() {
    if (initPromise) {
      return initPromise
    }
    initPromise = localForage
      .getItem<Record<string, string>>('flyenv-postgresql-storage-dir')
      .then((res) => {
        if (res) {
          PostgreSqlSetup.dir = reactive(res)
        }
      })
      .catch()
    return initPromise
  },
  save() {
    localForage
      .setItem('flyenv-postgresql-storage-dir', JSON.parse(JSON.stringify(PostgreSqlSetup.dir)))
      .then()
      .catch()
  }
})
