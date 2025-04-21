import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import localForage from 'localforage'
import Base from '@/core/Base'
import { uuid } from '@shared/utils'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { AllAppModule } from '@/core/type'
import { SetupStore } from '@/components/Setup/store'

const { dialog } = require('@electron/remote')
const { join } = require('path')
const { writeFile, existsSync, readFile } = require('fs-extra')

export type ProjectItem = {
  id: string
  path: string
  comment: string
  binVersion: string
  binPath: string
  binBin: string
  isSorting?: boolean
}

class Project {
  allDirs: string[] = []
  fetching = false
  project: ProjectItem[] = []
  search = ''
  flagType: AllAppModule = 'php'

  constructor(flagType: AllAppModule) {
    this.flagType = flagType
  }

  saveProject() {
    localForage
      .setItem(`flyenv-${this.flagType}-projects`, JSON.parse(JSON.stringify(this.project)))
      .then()
      .catch()
  }
  fetchProject() {
    if (this.fetching) {
      return
    }
    this.fetching = true
    localForage
      .getItem(`flyenv-${this.flagType}-projects`)
      .then((res: ProjectItem[]) => {
        if (res) {
          this.project.splice(0)
          this.project.push(...res)
        }
      })
      .catch()
      .finally(() => {
        this.fetching = false
      })
  }
  addProject() {
    const setupStore = SetupStore()
    const isLock = !setupStore.isActive && this.project.length > 2
    if (isLock) {
      MessageError(I18nT('host.licenseTips'))
      return
    }
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths

        if (!this.allDirs.includes(path)) {
          this.allDirs.push(path)
        }
        this.saveDirs().then(() => {
          this.initDirs()
        })

        const find = this.project.find((p) => p.path === path)
        if (find) {
          return
        }
        const item: ProjectItem = {
          id: uuid(),
          path,
          comment: '',
          binVersion: '',
          binPath: '',
          binBin: ''
        }
        this.project.unshift(item)
        this.saveProject()
      })
  }
  initDirs() {
    localForage
      .getItem('flyenv-projects-dirs')
      .then((res: string[]) => {
        if (res) {
          this.allDirs = res
          IPC.send('app-fork:tools', 'initAllowDir', res.join('\n')).then((key: string) => {
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
    try {
      const envFile = join(item.path, '.flyenv')
      if (!existsSync(envFile)) {
        if (!item.binVersion) {
          await writeFile(envFile, '')
        } else {
          const arr = [item.binPath, join(item.binPath, 'bin'), join(item.binPath, 'sbin')].filter(
            (s) => existsSync(s)
          )
          if (arr.length) {
            await writeFile(
              envFile,
              `#!/bin/zsh\nexport PATH="${arr.join(':')}:$PATH" #FlyEnv-ID-${item.id}`
            )
          }
        }
      } else {
        const content = await readFile(envFile, 'utf-8')
        const lines = content
          .trim()
          .split('\n')
          .filter((s: string) => {
            const line = s.trim()
            return !!line && !line.includes(`#FlyEnv-ID-${item.id}`)
          })
        if (item.binVersion) {
          const arr = [item.binPath, join(item.binPath, 'bin'), join(item.binPath, 'sbin')].filter(
            (s) => existsSync(s)
          )
          if (arr.length) {
            lines.push(`export PATH="${arr.join(':')}:$PATH" #FlyEnv-ID-${item.id}`)
          }
        }
        await writeFile(envFile, lines.join('\n'))
      }
    } catch (e: any) {
      MessageError(e.toString())
    }
  }
}

const ProjectSetups: Partial<Record<AllAppModule, Project>> = {}

export const ProjectSetup = (typeFlag: AllAppModule): Project => {
  if (!ProjectSetups?.[typeFlag]) {
    const p = reactive(new Project(typeFlag))
    p.saveProject = p.saveProject.bind(p)
    p.fetchProject = p.fetchProject.bind(p)
    p.addProject = p.addProject.bind(p)
    p.initDirs = p.initDirs.bind(p)
    p.saveDirs = p.saveDirs.bind(p)
    p.delProject = p.delProject.bind(p)
    p.setDirEnv = p.setDirEnv.bind(p)

    p.initDirs()
    p.fetchProject()
    ProjectSetups[typeFlag] = p
  }
  return ProjectSetups[typeFlag]!
}
