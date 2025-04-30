import { reactive } from 'vue'
import localForage from 'localforage'

export const TomcatSetup: {
  CATALINA_BASE: Record<string, string>
  init: () => void
  save: () => void
} = reactive({
  CATALINA_BASE: {},
  init() {
    localForage
      .getItem('flyenv-tomcat-server-root')
      .then((res: Record<string, string>) => {
        if (res) {
          TomcatSetup.CATALINA_BASE = reactive(res)
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem('flyenv-tomcat-server-root', JSON.parse(JSON.stringify(TomcatSetup.CATALINA_BASE)))
      .then()
      .catch()
  }
})
