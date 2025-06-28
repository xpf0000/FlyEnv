import { BrewStore } from '@/store/brew'
import { type AppHost, AppStore } from '@/store/app'

export const reloadWebServer = (hosts?: Array<AppHost>) => {
  const brewStore = BrewStore()
  let useSeted = false

  const apacheRunning = brewStore.module('apache').installed.find((a) => a.run)
  const apacheTaskRunning = brewStore.module('apache').installed.some((a) => a.running)
  if (apacheRunning && !apacheTaskRunning) {
    brewStore.module('apache').start().catch()
    useSeted = true
  }

  const nginxRunning = brewStore.module('nginx').installed.find((a) => a.run)
  const nginxTaskRunning = brewStore.module('nginx').installed.some((a) => a.running)
  if (nginxRunning && !nginxTaskRunning) {
    brewStore.module('nginx').start().catch()
    useSeted = true
  }

  const caddyRunning = brewStore.module('caddy').installed.find((a) => a.run)
  const caddyTaskRunning = brewStore.module('caddy').installed.some((a) => a.running)
  if (caddyRunning && !caddyTaskRunning) {
    brewStore.module('caddy').start().catch()
    useSeted = true
  }

  const tomcatRunning = brewStore.module('tomcat').installed.find((a) => a.run)
  const tomcatTaskRunning = brewStore.module('tomcat').installed.some((a) => a.running)
  if (tomcatRunning && !tomcatTaskRunning) {
    brewStore.module('tomcat').start().catch()
    useSeted = true
  }

  if (useSeted || !hosts || hosts?.length > 1) {
    return
  }

  if (hosts && hosts?.length === 1) {
    const appStore = AppStore()

    const currentApacheGet = () => {
      const current = appStore.config.server?.apache?.current
      const installed = brewStore.module('apache').installed
      if (!current) {
        return installed?.find((i) => !!i.path && !!i.version)
      }
      return installed?.find((i) => i.path === current?.path && i.version === current?.version)
    }

    const currentNginxGet = () => {
      const current = appStore.config.server?.nginx?.current
      const installed = brewStore.module('nginx').installed
      if (!current) {
        return installed?.find((i) => !!i.path && !!i.version)
      }
      return installed?.find((i) => i.path === current?.path && i.version === current?.version)
    }

    const currentCaddyGet = () => {
      const current = appStore.config.server?.caddy?.current
      const installed = brewStore.module('caddy').installed
      if (!current) {
        return installed?.find((i) => !!i.path && !!i.version)
      }
      return installed?.find((i) => i.path === current?.path && i.version === current?.version)
    }
    const caddy = currentCaddyGet()
    const nginx = currentNginxGet()
    const apache = currentApacheGet()
    if (caddy) {
      brewStore.module('caddy').start().catch()
    } else if (nginx) {
      brewStore.module('nginx').start().catch()
    } else if (apache) {
      brewStore.module('apache').start().catch()
    }

    const host = [...hosts].pop()
    if (host?.phpVersion) {
      const phpVersions = brewStore.module('php').installed
      const php = phpVersions?.find((p) => p.num === host.phpVersion)
      if (php) {
        brewStore.module('php').start().catch()
      }
    }
  }
}
