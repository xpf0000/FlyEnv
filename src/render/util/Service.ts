import IPC from '@/util/IPC'
import { BrewStore, type SoftInstalled } from '@/store/brew'
import { type AppHost, AppStore } from '@/store/app'
import { TaskStore } from '@/store/task'
import { I18nT } from '@lang/index'
import { Service } from '@/components/ServiceManager/service'
import installedVersions from '@/util/InstalledVersions'
import type { AllAppModule } from '@/core/type'

type ServiceActionExtParamFN = (
  typeFlag: AllAppModule,
  fn: string,
  version: SoftInstalled
) => Promise<any[]>

export const ServiceActionExtParam: Partial<Record<AllAppModule, ServiceActionExtParamFN>> = {}

const exec = (
  typeFlag: AllAppModule,
  fn: string,
  version: SoftInstalled
): Promise<string | boolean> => {
  return new Promise(async (resolve) => {
    if (version.running) {
      resolve(true)
      return
    }
    if (!version?.version) {
      resolve(I18nT('fork.versionNoFound'))
      return
    }
    version.running = true
    const args = JSON.parse(JSON.stringify(version))
    const taskStore = TaskStore()
    const brewStore = BrewStore()
    const task = taskStore.module(typeFlag)
    task?.log?.splice(0)

    const handleExecSuccess = (run: boolean) => {
      if (typeFlag !== 'php') {
        brewStore.module(typeFlag).installed.forEach((item) => {
          delete item?.pid
          item.run = false
        })
      } else {
        brewStore
          .module(typeFlag)
          .installed.filter((v) => v.num === version.num)
          .forEach((item) => {
            delete item?.pid
            item.run = false
          })
      }
      version.run = run
      const findV = brewStore
        .module(typeFlag)
        .installed?.find(
          (i) => i.path === version.path && i.version === version.version && i.bin === version.bin
        )
      if (findV) {
        findV.run = run
      }
    }
    const handleTaskSuccess = (run: boolean, pid?: string) => {
      if (typeFlag !== 'php') {
        brewStore.module(typeFlag).installed.forEach((item) => {
          delete item?.pid
          item.run = false
        })
      } else {
        brewStore
          .module(typeFlag)
          .installed.filter((v) => v.num === version.num)
          .forEach((item) => {
            delete item?.pid
            item.run = false
          })
      }
      version.run = run
      version.running = false
      version.pid = pid
      const findV = brewStore
        .module(typeFlag)
        .installed?.find(
          (i) => i.path === version.path && i.version === version.version && i.bin === version.bin
        )
      if (findV) {
        findV.run = run
        findV.running = false
        findV.pid = pid
      }

      if (typeFlag === 'php') {
        brewStore
          .module(typeFlag)
          .installed.filter((v) => v.num === version.num)
          .forEach((item) => {
            item.pid = pid
          })
      }
    }
    const handleTaskFailed = () => {
      if (typeFlag !== 'php') {
        brewStore.module(typeFlag).installed.forEach((item) => {
          delete item?.pid
          item.run = false
        })
      } else {
        brewStore
          .module(typeFlag)
          .installed.filter((v) => v.num === version.num)
          .forEach((item) => {
            delete item?.pid
            item.run = false
          })
      }

      version.run = false
      version.running = false
      delete version.pid
      const findV = brewStore
        .module(typeFlag)
        .installed?.find(
          (i) => i.path === version.path && i.version === version.version && i.bin === version.bin
        )
      if (findV) {
        findV.run = false
        findV.running = false
        delete findV.pid
      }
    }

    let params: any[] = []

    if (ServiceActionExtParam?.[typeFlag]) {
      try {
        params = await ServiceActionExtParam[typeFlag](typeFlag, fn, version)
      } catch (e) {
        handleTaskFailed()
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

    IPC.send(`app-fork:${typeFlag}`, fn, args, ...params).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        const pid = res?.data?.['APP-Service-Start-PID'] ?? ''
        handleTaskSuccess(fn !== 'stopService', pid)
        resolve(true)
      } else if (res.code === 1) {
        IPC.off(key)
        task?.log?.push(res.msg)
        handleTaskFailed()
        resolve(task?.log?.join('\n') ?? '')
      } else if (res.code === 200) {
        if (typeof res?.msg === 'string') {
          task.log!.push(res.msg)
        } else if (res?.msg?.['APP-Service-Start-Success'] === true) {
          handleExecSuccess(true)
        } else if (res?.msg?.['APP-Service-Stop-Success'] === true) {
          handleExecSuccess(false)
        }
      }
    })
  })
}

export const stopService = (typeFlag: AllAppModule, version: SoftInstalled) => {
  return exec(typeFlag, 'stopService', version)
}

export const startService = (typeFlag: AllAppModule, version: SoftInstalled) => {
  return exec(typeFlag, 'startService', version)
}

export const reloadService = (typeFlag: AllAppModule, version: SoftInstalled) => {
  return exec(typeFlag, 'startService', version)
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

  const tomcatRunning = brewStore.module('tomcat').installed.find((a) => a.run)
  const tomcatTaskRunning = brewStore.module('tomcat').installed.some((a) => a.running)
  if (tomcatRunning && !tomcatTaskRunning) {
    startService('tomcat', tomcatRunning).then()
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
      startService('caddy', caddy).then()
    } else if (nginx) {
      startService('nginx', nginx).then()
    } else if (apache) {
      startService('apache', apache).then()
    }

    const host = [...hosts].pop()
    if (host?.phpVersion) {
      const phpVersions = brewStore.module('php').installed
      const php = phpVersions?.find((p) => p.num === host.phpVersion)
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
    data!.installedInited = false
    installedVersions.allInstalledVersions([type]).then(() => {
      service.fetching = false
      resolve(true)
    })
  })
}
