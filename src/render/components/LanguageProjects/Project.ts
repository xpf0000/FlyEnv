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
  void debug.log('[LanguageProjects][setDirEnv][timing]', JSON.stringify(details)).catch(() => {})
}

const measureSetDirEnvStep = async <T>(
  timings: Record<string, number>,
  context: Record<string, unknown>,
  step: string,
  operation: () => Promise<T>
): Promise<T> => {
  const startedAt = Date.now()
  try {
    return await operation()
  } finally {
    const durationMs = Date.now() - startedAt
    timings[step] = durationMs
    logSetDirEnvTiming({ event: 'step', ...context, step, durationMs })
  }
}

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
                .catch()
                .finally(() => {
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
        item.stop().catch()
        this.project.splice(index, 1)
        this.saveProject()
        const dirIndex = this.allDirs.indexOf(item.path)
        if (dirIndex >= 0) {
          this.allDirs.splice(dirIndex, 1)
        }
        this.saveDirs().then(() => {
          this.initDirs()
        })
      })
      .catch(() => {})
  }
  async setDirEnv(item: ProjectItem) {
    const timings: Record<string, number> = {}
    const startedAt = Date.now()
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
          totalMs: Date.now() - startedAt,
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
                if (arr.length) {
                  await fs.writeFile(
                    envFile,
                    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$env:PATH = "${arr.join(';')};" + $env:PATH #FlyEnv-ID-${item.id}`
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
                  lines.push(`$env:PATH = "${arr.join(';')};" + $env:PATH #FlyEnv-ID-${item.id}`)
                }
              }
              await fs.writeFile(envFile, lines.join('\n'))
            }
          } catch (e: any) {
            MessageError(e.toString())
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
          totalMs: Date.now() - startedAt,
          timings
        })
        return false
      }
      logSetDirEnvTiming({
        event: 'completed',
        ...context,
        status: 'ready',
        totalMs: Date.now() - startedAt,
        timings
      })
      return true
    } catch (error) {
      logSetDirEnvTiming({
        event: 'failed',
        ...context,
        step: currentStep,
        totalMs: Date.now() - startedAt,
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
