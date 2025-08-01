import { reactive } from 'vue'
import localForage from 'localforage'

export const PostgreSqlSetup: {
  dir: Record<string, string>
  init: () => void
  save: () => void
} = reactive({
  dir: {},
  init() {
    localForage
      .getItem('flyenv-postgresql-storage-dir')
      .then((res: Record<string, string>) => {
        if (res) {
          PostgreSqlSetup.dir = reactive(res)
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem('flyenv-postgresql-storage-dir', JSON.parse(JSON.stringify(PostgreSqlSetup.dir)))
      .then()
      .catch()
  }
})
