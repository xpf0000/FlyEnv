import { BrewStore } from '@/store/brew'
import { type AppHost } from '@/store/app'

export const reloadWebServer = (hosts?: Array<AppHost>) => {
  const brewStore = BrewStore()
  let useSeted = false

  const apacheRunning = brewStore.module('apache').installed.find((a) => a.run)
  const apacheTaskRunning = brewStore.module('apache').installed.some((a) => a.running)
  if (apacheRunning && !apacheTaskRunning) {
    brewStore.currentVersion('apache')?.restart?.()?.catch?.()
    useSeted = true
  }

  const nginxRunning = brewStore.module('nginx').installed.find((a) => a.run)
  const nginxTaskRunning = brewStore.module('nginx').installed.some((a) => a.running)
  if (nginxRunning && !nginxTaskRunning) {
    brewStore.currentVersion('nginx')?.restart?.()?.catch?.()
    useSeted = true
  }

  const caddyRunning = brewStore.module('caddy').installed.find((a) => a.run)
  const caddyTaskRunning = brewStore.module('caddy').installed.some((a) => a.running)
  if (caddyRunning && !caddyTaskRunning) {
    brewStore.currentVersion('caddy')?.restart?.()?.catch?.()
    useSeted = true
  }

  const tomcatRunning = brewStore.module('tomcat').installed.find((a) => a.run)
  const tomcatTaskRunning = brewStore.module('tomcat').installed.some((a) => a.running)
  if (tomcatRunning && !tomcatTaskRunning) {
    brewStore.currentVersion('tomcat')?.restart?.()?.catch?.()
    useSeted = true
  }

  if (useSeted || !hosts || hosts?.length > 1) {
    return
  }

  if (hosts && hosts?.length === 1) {
    if (brewStore.module('caddy').installed.length) {
      brewStore.module('caddy').start().catch()
    } else if (brewStore.module('nginx').installed.length) {
      brewStore.module('nginx').start().catch()
    } else if (brewStore.module('apache').installed.length) {
      brewStore.module('apache').start().catch()
    }

    const host = [...hosts].pop()
    if (host?.phpVersion) {
      const phpVersions = brewStore.module('php').installed
      const php = phpVersions?.find((p) => p.num === host.phpVersion)
      if (php) {
        php.start().catch()
      }
    }
  }
}
