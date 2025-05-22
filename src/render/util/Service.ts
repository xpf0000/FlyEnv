import IPC from '@/util/IPC'
import { BrewStore, type SoftInstalled } from '@/store/brew'
import { type AppHost, AppStore } from '@/store/app'
import { TaskStore } from '@/store/task'
import { I18nT } from '@lang/index'
import { Service } from '@/components/ServiceManager/service'
import installedVersions from '@/util/InstalledVersions'
import { AllAppModule } from '@/core/type'

type ServiceActionExtParamFN = (
  typeFlag: AllAppModule,
  fn: string,
  version: SoftInstalled
) => Promise<any[]>

export const ServiceActionExtParam: Partial<Record<AllAppModule, ServiceActionExtParamFN>> = {}

const exec = (
  typeFlag: AllAppModule,
  fn: string,
  version: SoftInstalled,
  lastVersion?: SoftInstalled
): Promise<string | boolean> => {
  return new Promise(async (resolve) => {
    if (version.running) {
      resolve(true)
      return
    }
    if (!version?.version) {
      resolve(I18nT('util.versionNoFound'))
      return
    }
    version.running = true
    const args = JSON.parse(JSON.stringify(version))
    const taskStore = TaskStore()
    const task = taskStore.module(typeFlag)!
    task.log!.splice(0)
    console.log('exec time: ', new Date().getTime())
    const brewStore = BrewStore()
    const handleResult = (run: boolean, pid?: string) => {
      if (lastVersion && lastVersion?.path) {
        const find = brewStore
          .module(typeFlag)
          .installed?.find(
            (i) =>
              i.path === lastVersion.path &&
              i.version === lastVersion.version &&
              i.bin === lastVersion.bin
          )
        lastVersion.pid = undefined
        lastVersion.run = false
        lastVersion.running = false
        if (find) {
          find.pid = undefined
          find.run = false
          find.running = false
        }
      }

      const findV = brewStore
        .module(typeFlag)
        .installed?.find(
          (i) => i.path === version.path && i.version === version.version && i.bin === version.bin
        )
      version.run = run
      version.running = false
      version.pid = pid
      if (findV) {
        findV.run = version.run
        findV.running = false
        findV.pid = pid
      }
    }

    let params: any[] = []

    if (ServiceActionExtParam?.[typeFlag]) {
      try {
        params = await ServiceActionExtParam[typeFlag]!(typeFlag, fn, version)
      } catch (e) {
        handleResult(false)
        return resolve(true)
      }
    }

    const handleVersion = () => {
      if (fn !== 'startService') {
        return
      }
      const appStore = AppStore()
      const flag = typeFlag
      const server: any = appStore.config.server
      const currentVersion = server?.[flag]?.current
      const currentItem = brewStore
        .module(typeFlag)
        ?.installed?.find(
          (i) => i.path === currentVersion?.path && i.version === currentVersion?.version
        )

      if (version.version !== currentItem?.version || version.path !== currentItem?.path) {
        appStore.UPDATE_SERVER_CURRENT({
          flag: typeFlag,
          data: JSON.parse(JSON.stringify(version))
        })
        appStore.saveConfig().then().catch()
      }
    }

    handleVersion()

    IPC.send(`app-fork:${typeFlag}`, fn, args, lastVersion, ...params).then(
      (key: string, res: any) => {
        if (res.code === 0) {
          console.log('### key: ', key)
          IPC.off(key)
          const pid = res?.data?.['APP-Service-Start-PID'] ?? ''
          handleResult(fn !== 'stopService', pid)
          resolve(true)
        } else if (res.code === 1) {
          IPC.off(key)
          task.log!.push(res.msg)
          handleResult(false)
          resolve(task.log!.join('\n'))
        } else if (res.code === 200) {
          if (typeof res?.msg === 'string') {
            task.log!.push(res.msg)
          } else if (res?.msg?.['APP-Service-Start-Success'] === true) {
            handleResult(true)
          } else if (res?.msg?.['APP-Service-Stop-Success'] === true) {
            handleResult(false)
          }
        }
      }
    )
  })
}

export const stopService = (typeFlag: AllAppModule, version: SoftInstalled) => {
  return exec(typeFlag, 'stopService', version)
}

export const startService = (
  typeFlag: AllAppModule,
  version: SoftInstalled,
  lastVersion?: SoftInstalled
) => {
  return exec(typeFlag, 'startService', version, lastVersion)
}

export const reloadWebServer = (hosts?: Array<AppHost>) => {
  const brewStore = BrewStore()
  let useSeted = false

  const apacheRunning = brewStore.module('apache').installed.find((a) => a.run)
  const apacheTaskRunning = brewStore.module('apache').installed.some((a) => a.running)
  if (apacheRunning && !apacheTaskRunning) {
    startService('apache', apacheRunning).then()
    useSeted = true
  }

  const nginxRunning = brewStore.module('nginx').installed.find((a) => a.run)
  const nginxTaskRunning = brewStore.module('nginx').installed.some((a) => a.running)
  if (nginxRunning && !nginxTaskRunning) {
    startService('nginx', nginxRunning).then()
    useSeted = true
  }

  const caddyRunning = brewStore.module('caddy').installed.find((a) => a.run)
  const caddyTaskRunning = brewStore.module('caddy').installed.some((a) => a.running)
  if (caddyRunning && !caddyTaskRunning) {
    startService('caddy', caddyRunning).then()
    useSeted = true
  }

  if (useSeted || !hosts || hosts?.length > 1) {
    return
  }

  if (hosts && hosts?.length === 1) {
    const appStore = AppStore()

    const currentApacheGet = () => {
      const current = appStore.config.server?.apache?.current
      const installed = brewStore.module('apache')?.installed
      if (!current) {
        return installed?.find((i) => !!i.path && !!i.version)
      }
      return installed?.find((i) => i.path === current?.path && i.version === current?.version)
    }

    const currentNginxGet = () => {
      const current = appStore.config.server?.nginx?.current
      const installed = brewStore.module('nginx')?.installed
      if (!current) {
        return installed?.find((i) => !!i.path && !!i.version)
      }
      return installed?.find((i) => i.path === current?.path && i.version === current?.version)
    }

    const currentCaddyGet = () => {
      const current = appStore.config.server?.caddy?.current
      const installed = brewStore.module('caddy')?.installed
      if (!current) {
        return installed?.find((i) => !!i.path && !!i.version)
      }
      return installed?.find((i) => i.path === current?.path && i.version === current?.version)
    }
    const caddy = currentCaddyGet()
    const nginx = currentNginxGet()
    const apache = currentApacheGet()
    if (caddy) {
      startService('caddy', caddy).then()
    } else if (nginx) {
      startService('nginx', nginx).then()
    } else if (apache) {
      startService('apache', apache).then()
    }

    const host = [...hosts].pop()
    console.log('reloadWebServer host: ', host, host?.phpVersion)
    if (host?.phpVersion) {
      const phpVersions = brewStore.module('php')?.installed ?? []
      const php = phpVersions?.find((p) => p.num === host.phpVersion)
      console.log('reloadWebServer php: ', php)
      if (php) {
        startService('php', php).then()
      }
    }
  }
}

export const reGetInstalled = (type: AllAppModule) => {
  return new Promise((resolve) => {
    const service = Service[type]
    if (service?.fetching) {
      resolve(true)
      return
    }
    service.fetching = true
    const brewStore = BrewStore()
    const data = brewStore.module(type)
    data.installedInited = false
    installedVersions.allInstalledVersions([type]).then(() => {
      service.fetching = false
      resolve(true)
    })
  })
}
