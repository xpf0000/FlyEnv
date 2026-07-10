import type { AllAppModule } from '@/core/type'
import localForage from 'localforage'
import { SetupStore } from '@/components/Setup/store'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { fs, shell } from '@/util/NodeFn'
import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import Base from '@/core/Base'
import { join } from '@/util/path-browserify'
import { ProjectItem } from './ProjectItem'
import { AsyncComponentShow } from '@/util/AsyncComponent'
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
      }).then((res: ProjectItem) => {
        if (res) {
          const item = reactiveBind(new ProjectItem({ ...res, typeFlag: this.flagType }))
          this.prepareProject(item)
          this.project.unshift(item)
          this.saveProject()
          this.setDirEnv(item).catch()
        }
      })
    })
  }
  initDirs() {
    localForage
      .getItem('flyenv-projects-dirs')
      .then((res: string[]) => {
        if (res) {
          this.allDirs = res
          const dirs = window.Server.isWindows ? JSON.stringify(res) : res.join('\n')
          IPC.send('app-fork:tools', 'initAllowDir', dirs).then((key: string) => {
            IPC.off(key)
          })
        }
      })
      .catch(() => {
        this.allDirs = []
      })
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
    await this.syncRoadRunnerConfigPort(item)
    IPC.send('app-fork:tools', 'initFlyEnvSH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 1) {
        MessageError(res?.msg ?? '')
      }
    })
    if (!this.allDirs.includes(item.path)) {
      this.allDirs.push(item.path)
    }
    this.saveDirs().then(() => {
      this.initDirs()
    })
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
  }
  stopAll(): Promise<boolean[]> {
    return Promise.all(this.project.map((p) => p.stop()))
  }
  startAll(): Promise<Array<string | boolean>> {
    return Promise.all(this.project.map((p) => p.start()))
  }
}
