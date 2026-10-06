import {
  performanceDiagnosticNow,
  performanceDiagnosticElapsed,
  writePerformanceLog,
  measurePerformanceStep
} from '@shared/PerformanceDiagnostics'
import type { AllAppModule } from '@/core/type'
import localForage from 'localforage'
import { SetupStore } from '@/components/Setup/store'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { debug, fs, shell } from '@/util/NodeFn'
import { reactiveBind } from '@/util/Index'
import Base from '@/core/Base'
import { join } from '@/util/path-browserify'
import { ProjectItem } from './ProjectItem'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import ShellInitController from '@/components/Tools/ShellInitController'
import { ensureDataDirectoryReady } from '@/core/DataDirectoryStartup'
import {
  roadRunnerPrimaryConfigPath,
  roadRunnerServeCommand,
  syncRoadRunnerConfigPath,
  updateRoadRunnerConfigPort,
  type RoadRunnerProjectItem
} from '@/components/RoadRunner/project'
import {
  defaultSwooleCliScriptPath,
  inferSwooleCliPreset,
  swooleCliPresetCommand,
  type SwooleCliProjectItem
} from '@/components/SwooleCli/project'

const logSetDirEnvTiming = (details: Record<string, unknown>) => {
  void writePerformanceLog(
    (category, message) => debug.log(category, message),
    '[LanguageProjects][setDirEnv][timing]',
    details
  )
}

/** 项目版本目录只作为 PowerShell 字符串数据；$、反引号和单引号不得被解释执行。 */
const windowsProjectPathLiteral = (entries: string[]): string => {
  if (
    entries.some(
      (entry) =>
        /[\x00-\x1f\x7f;]/u.test(entry) ||
        !/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/iu.test(entry)
    )
  ) {
    // 不允许依赖终端当前目录的相对路径；分号无法在 PATH 单个条目中表示。
    throw new Error(
      'Project version requires full Windows paths without control characters or PATH separators'
    )
  }
  return `'${(entries.join(';') + ';').replace(/'/g, "''")}'`
}

const measureSetDirEnvStep = async <T>(
  timings: Record<string, number>,
  context: Record<string, unknown>,
  step: string,
  operation: () => Promise<T>
): Promise<T> =>
  measurePerformanceStep(step, operation, (event) => {
    const durationMs = event.durationMs ?? 0
    timings[step] = durationMs
    logSetDirEnvTiming({ event: 'step', ...context, step, durationMs })
  })

export class Project {
  allDirs: string[] = []
  fetching = false
  fetched = false
  project: ProjectItem[] = []
  search = ''
  flagType: AllAppModule = 'golang'
  private fetchProjectPromise?: Promise<void>

  constructor(flagType: AllAppModule) {
    this.flagType = flagType
  }

  private prepareRoadRunnerProject(item: ProjectItem): boolean {
    if (this.flagType !== 'roadrunner' || !item.path) {
      return false
    }
    let changed = false
    if (!item.runCommand) {
      item.commandType = 'command'
      item.runCommand = roadRunnerServeCommand(item.path, roadRunnerPrimaryConfigPath(item))
      changed = true
    }
    const old = JSON.stringify({
      configPath: item.configPath,
      roadRunnerConfigPath: item.roadRunnerConfigPath
    })
    const rrItem = item as RoadRunnerProjectItem
    const shouldSyncConfig =
      !['custom', 'laravel-octane'].includes(`${rrItem.roadRunnerPreset}`) ||
      !!rrItem.roadRunnerConfigPath ||
      item.configPath.length > 0
    if (shouldSyncConfig) {
      syncRoadRunnerConfigPath(item)
    }
    changed =
      JSON.stringify({
        configPath: item.configPath,
        roadRunnerConfigPath: item.roadRunnerConfigPath
      }) !== old || changed
    return changed
  }

  private prepareSwooleCliProject(item: ProjectItem): boolean {
    if (this.flagType !== 'swoole-cli' || !item.path) {
      return false
    }
    const old = JSON.stringify({
      commandType: item.commandType,
      runCommand: item.runCommand,
      swooleCliPreset: item.swooleCliPreset,
      swooleCliScriptPath: item.swooleCliScriptPath
    })
    const swooleItem = item as SwooleCliProjectItem
    swooleItem.swooleCliPreset = inferSwooleCliPreset(swooleItem)
    const preset = swooleItem.swooleCliPreset || 'native'
    if (['native', 'php-script'].includes(preset) && !swooleItem.swooleCliScriptPath) {
      swooleItem.swooleCliScriptPath = defaultSwooleCliScriptPath(item.path)
    }
    item.commandType = 'command'
    if (preset !== 'custom') {
      item.runCommand = swooleCliPresetCommand(
        preset,
        item.path,
        item.projectPort || 3000,
        swooleItem.swooleCliScriptPath
      )
    }
    return (
      JSON.stringify({
        commandType: item.commandType,
        runCommand: item.runCommand,
        swooleCliPreset: item.swooleCliPreset,
        swooleCliScriptPath: item.swooleCliScriptPath
      }) !== old
    )
  }

  prepareProject(item: ProjectItem): boolean {
    return this.prepareRoadRunnerProject(item) || this.prepareSwooleCliProject(item)
  }

  private async syncRoadRunnerConfigPort(item: ProjectItem) {
    if (this.flagType !== 'roadrunner' || !item.path) {
      return
    }
    const rrItem = item as RoadRunnerProjectItem
    const configFile = roadRunnerPrimaryConfigPath(rrItem)
    if (!configFile || !(await fs.existsSync(configFile))) {
      return
    }
    const content = await fs.readFile(configFile)
    const next = updateRoadRunnerConfigPort(content, item.projectPort || 3000)
    if (next !== content) {
      await fs.writeFile(configFile, next)
    }
  }

  private projectEditComponent() {
    if (this.flagType === 'roadrunner') {
      return import('@/components/RoadRunner/ProjectEdit.vue')
    }
    if (this.flagType === 'swoole-cli') {
      return import('@/components/SwooleCli/ProjectEdit.vue')
    }
    return import('./ProjectEdit.vue')
  }

  action(item: ProjectItem, index: number, action: 'open' | 'edit' | 'log' | 'config') {
    switch (action) {
      case 'open':
        shell.openPath(item.path).catch()
        break
      case 'edit':
        this.projectEditComponent().then((res) => {
          AsyncComponentShow(res.default, {
            isEdit: true,
            edit: item,
            typeFlag: this.flagType
          }).then((res: ProjectItem) => {
            if (res) {
              console.log('action: ', item)
              const isRun = item?.state?.isRun
              item
                .stop()
                .then((stopped) => {
                  // stop 失败时旧服务仍可能使用原配置；不要覆盖配置或再启动第二个实例。
                  if (stopped !== true) {
                    MessageError(typeof stopped === 'string' ? stopped : I18nT('base.fail'))
                    return
                  }
                  const state = JSON.parse(JSON.stringify(item.state))
                  Object.assign(item, res)
                  Object.assign(item.state, state)
                  this.prepareProject(item)
                  this.saveProject()
                  this.setDirEnv(item).catch()
                  if (isRun) {
                    item.start().catch()
                  }
                })
                .catch()
            }
          })
        })
        break
      case 'log':
        import('./LogViewer.vue').then((res) => {
          AsyncComponentShow(res.default, {
            item
          }).catch()
        })
        break
      case 'config':
        import('./ConfigViewer.vue').then((res) => {
          AsyncComponentShow(res.default, {
            item
          }).catch()
        })
        break
    }
  }

  saveProject() {
    localForage
      .setItem(`flyenv-${this.flagType}-projects`, JSON.parse(JSON.stringify(this.project)))
      .then()
      .catch()
  }
  fetchProject(): Promise<void> {
    if (this.fetching) {
      return this.fetchProjectPromise ?? Promise.resolve()
    }
    this.fetching = true
    this.fetchProjectPromise = localForage
      .getItem(`flyenv-${this.flagType}-projects`)
      .then((res: ProjectItem[]) => {
        if (res) {
          this.project.splice(0)
          let needSave = false
          for (const i of res) {
            const item = reactiveBind(new ProjectItem({ ...i, typeFlag: this.flagType }))
            needSave = this.prepareProject(item) || needSave
            this.project.push(item)
          }
          if (needSave) {
            this.saveProject()
          }
        }
        this.fetched = true
      })
      .catch(() => {
        this.fetched = false
      })
      .finally(() => {
        this.fetching = false
        this.fetchProjectPromise = undefined
      })
    return this.fetchProjectPromise
  }
  addProject() {
    const setupStore = SetupStore()
    const isLock = !setupStore.isActive && this.project.length > 2
    if (isLock) {
      MessageError(I18nT('host.licenseTips'))
      return
    }
    this.projectEditComponent().then((res) => {
      AsyncComponentShow(res.default, {
        isEdit: false,
        edit: {},
        typeFlag: this.flagType
      }).then(async (res: ProjectItem) => {
        if (res) {
          const item = reactiveBind(new ProjectItem({ ...res, typeFlag: this.flagType }))
          this.prepareProject(item)
          const ready = await this.setDirEnv(item).catch(() => false)
          if (!ready) return
          this.project.unshift(item)
          this.saveProject()
        }
      })
    })
  }
  async initDirs(): Promise<boolean> {
    if (!(await ensureDataDirectoryReady())) {
      return false
    }
    let dirs: string[] | null
    try {
      dirs = await localForage.getItem<string[]>('flyenv-projects-dirs')
    } catch {
      this.allDirs = []
      return false
    }
    if (!dirs) return true
    this.allDirs = dirs
    const serialized = window.Server.isWindows ? JSON.stringify(dirs) : dirs.join('\n')
    try {
      await ShellInitController.syncAllowedDirs(serialized)
      return true
    } catch {
      return false
    }
  }
  saveDirs(): Promise<any> {
    return localForage.setItem('flyenv-projects-dirs', JSON.parse(JSON.stringify(this.allDirs)))
  }
  delProject(index: number) {
    Base._Confirm(I18nT('base.delAlertContent'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const item = this.project[index]
        item
          .stop()
          .then((stopped) => {
            // PID 未确认停止时保留项目行、目录授权和重试入口。
            if (stopped !== true) return
            const currentIndex = this.project.indexOf(item)
            if (currentIndex < 0) return
            this.project.splice(currentIndex, 1)
            this.saveProject()
            const dirIndex = this.allDirs.indexOf(item.path)
            if (dirIndex >= 0) {
              this.allDirs.splice(dirIndex, 1)
            }
            this.saveDirs().then(() => {
              this.initDirs()
            })
          })
          .catch((error) => MessageError(String(error)))
      })
      .catch(() => {})
  }
  async setDirEnv(item: ProjectItem) {
    const timings: Record<string, number> = {}
    const startedAt = performanceDiagnosticNow()
    const context = { module: this.flagType, projectId: item.id }
    let currentStep = 'ensure-data-directory-ready'
    try {
      const dataDirectoryReady = await measureSetDirEnvStep(timings, context, currentStep, () =>
        ensureDataDirectoryReady()
      )
      if (!dataDirectoryReady) {
        logSetDirEnvTiming({
          event: 'completed',
          ...context,
          status: 'data-directory-not-ready',
          totalMs: performanceDiagnosticElapsed(startedAt),
          timings
        })
        return false
      }

      currentStep = 'sync-roadrunner-config-port'
      await measureSetDirEnvStep(timings, context, currentStep, () =>
        this.syncRoadRunnerConfigPort(item)
      )
      currentStep = 'write-project-env-file'
      await measureSetDirEnvStep(timings, context, currentStep, async () => {
        if (window.Server.isWindows) {
          try {
            const envFile = join(item.path, '.flyenv')
            const exists = await fs.existsSync(envFile)
            if (!exists) {
              if (!item.binVersion) {
                await fs.writeFile(envFile, '')
              } else {
                const arr: string[] = []
                const list = [item.binPath, join(item.binPath, 'bin'), join(item.binPath, 'sbin')]
                for (const s of list) {
                  const e = await fs.existsSync(s)
                  if (e) {
                    arr.push(s)
                  }
                }
                // 已选择的版本不存在时必须失败，不能写入空配置后声称版本已启用。
                if (!arr.length)
                  throw new Error('Selected project version directory is unavailable')
                if (arr.length) {
                  await fs.writeFile(
                    envFile,
                    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$env:PATH = ${windowsProjectPathLiteral(arr)} + $env:PATH #FlyEnv-ID-${item.id}`
                  )
                }
              }
            } else {
              // 保留用户手写的 .flyenv 内容；读取失败不能当空文件再覆盖。
              const content = await fs.readFileStrict(envFile)
              const lines = content
                .trim()
                .split('\n')
                .filter((s: string) => {
                  const line = s.trim()
                  return !!line && !line.includes(`#FlyEnv-ID-${item.id}`)
                })
              if (item.binVersion) {
                const arr: string[] = []
                const list = [item.binPath, join(item.binPath, 'bin'), join(item.binPath, 'sbin')]
                for (const s of list) {
                  const e = await fs.existsSync(s)
                  if (e) {
                    arr.push(s)
                  }
                }
                // 更新现有配置也必须确认所选版本存在，失败时保留原文件内容。
                if (!arr.length)
                  throw new Error('Selected project version directory is unavailable')
                if (arr.length) {
                  lines.push(
                    `$env:PATH = ${windowsProjectPathLiteral(arr)} + $env:PATH #FlyEnv-ID-${item.id}`
                  )
                }
              }
              await fs.writeFile(envFile, lines.join('\n'))
            }
          } catch (e: any) {
            MessageError(e.toString())
            // 写入失败/取消必须结束项目版本设置，不能继续注册目录并返回 ready。
            throw e
          }
        } else {
          try {
            const envFile = join(item.path, '.flyenv')
            const exists = await fs.existsSync(envFile)
            if (!exists) {
              if (!item.binVersion) {
                await fs.writeFile(envFile, '')
              } else {
                const arr: string[] = []
                const list = [item.binPath, join(item.binPath, 'bin'), join(item.binPath, 'sbin')]
                for (const s of list) {
                  const e = await fs.existsSync(s)
                  if (e) {
                    arr.push(s)
                  }
                }
                if (arr.length) {
                  await fs.writeFile(
                    envFile,
                    `#!/bin/zsh\nexport PATH="${arr.join(':')}:$PATH" #FlyEnv-ID-${item.id}`
                  )
                }
              }
            } else {
              const content = await fs.readFile(envFile)
              const lines = content
                .trim()
                .split('\n')
                .filter((s: string) => {
                  const line = s.trim()
                  return !!line && !line.includes(`#FlyEnv-ID-${item.id}`)
                })
              if (item.binVersion) {
                const arr: string[] = []
                const list = [item.binPath, join(item.binPath, 'bin'), join(item.binPath, 'sbin')]
                for (const s of list) {
                  const e = await fs.existsSync(s)
                  if (e) {
                    arr.push(s)
                  }
                }
                if (arr.length) {
                  lines.push(`export PATH="${arr.join(':')}:$PATH" #FlyEnv-ID-${item.id}`)
                }
              }
              await fs.writeFile(envFile, lines.join('\n'))
            }
          } catch (e: any) {
            MessageError(e.toString())
          }
        }
      })
      const wasExistingDir = this.allDirs.includes(item.path)
      if (!wasExistingDir) {
        this.allDirs.push(item.path)
      }
      currentStep = 'save-project-directories'
      await measureSetDirEnvStep(timings, context, currentStep, () => this.saveDirs())
      currentStep = 'initialize-project-directories'
      const dirsInitialized = await measureSetDirEnvStep(timings, context, currentStep, () =>
        this.initDirs()
      )
      let shellInitialized = false
      if (dirsInitialized) {
        currentStep = 'initialize-shell-hook'
        shellInitialized = !!(await measureSetDirEnvStep(timings, context, currentStep, () =>
          ShellInitController.ensure()
        ))
      }
      if (!dirsInitialized || !shellInitialized) {
        if (!wasExistingDir) {
          const dirIndex = this.allDirs.lastIndexOf(item.path)
          if (dirIndex >= 0) {
            this.allDirs.splice(dirIndex, 1)
          }
          await this.saveDirs()
          await this.initDirs()
        }
        logSetDirEnvTiming({
          event: 'completed',
          ...context,
          status: dirsInitialized ? 'shell-not-initialized' : 'directories-not-initialized',
          totalMs: performanceDiagnosticElapsed(startedAt),
          timings
        })
        return false
      }
      logSetDirEnvTiming({
        event: 'completed',
        ...context,
        status: 'ready',
        totalMs: performanceDiagnosticElapsed(startedAt),
        timings
      })
      return true
    } catch (error) {
      logSetDirEnvTiming({
        event: 'failed',
        ...context,
        step: currentStep,
        totalMs: performanceDiagnosticElapsed(startedAt),
        timings,
        error: error instanceof Error ? error.message : `${error}`
      })
      throw error
    }
  }
  stopAll(): Promise<boolean[]> {
    return Promise.all(this.project.map((p) => p.stop()))
  }
  startAll(): Promise<Array<string | boolean>> {
    return Promise.all(this.project.map((p) => p.start()))
  }
}
