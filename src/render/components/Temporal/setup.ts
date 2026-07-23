import { reactive } from 'vue'
import localForage from 'localforage'

export const TemporalSetup: {
  uiEnabled: boolean
  init: () => void
  save: () => void
} = reactive({
  uiEnabled: true,
  init() {
    localForage
      .getItem('flyenv-temporal-ui-enabled')
      .then((res: boolean | null) => {
        if (res !== null && res !== undefined) {
          TemporalSetup.uiEnabled = !!res
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem('flyenv-temporal-ui-enabled', TemporalSetup.uiEnabled)
      .then()
      .catch()
  }
})
