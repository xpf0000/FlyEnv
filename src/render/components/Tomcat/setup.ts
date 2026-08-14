import { reactive } from 'vue'
import localForage from 'localforage'
import type { SoftInstalled } from '@shared/app'
import { join } from '@/util/path-browserify'

let initPromise: Promise<void> | undefined

export const TomcatSetup: {
  CATALINA_BASE: Record<string, string>
  init: () => Promise<void>
  save: () => void
} = reactive({
  CATALINA_BASE: {},
  init() {
    if (!initPromise) {
      initPromise = localForage
        .getItem<Record<string, string>>('flyenv-tomcat-server-root')
        .then((value) => {
          if (value) {
            TomcatSetup.CATALINA_BASE = reactive(value)
          }
        })
        .catch(() => {})
    }
    return initPromise
  },
  save() {
    localForage
      .setItem('flyenv-tomcat-server-root', JSON.parse(JSON.stringify(TomcatSetup.CATALINA_BASE)))
      .then()
      .catch()
  }
})

export const tomcatDefaultCatalinaBase = (version: SoftInstalled) => {
  const major = version.version?.split('.').shift() ?? ''
  return join(window.Server.BaseDir!, `tomcat/tomcat${major}`)
}

export const tomcatCatalinaBase = (version: SoftInstalled) =>
  TomcatSetup.CATALINA_BASE[version.bin] ?? tomcatDefaultCatalinaBase(version)
