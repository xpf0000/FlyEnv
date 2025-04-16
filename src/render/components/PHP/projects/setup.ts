import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import localForage from 'localforage'
import Base from '@/core/Base'
import { uuid } from '@shared/utils'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'

const { dialog } = require('@electron/remote')
const { join } = require('path')
const { writeFile, existsSync } = require('fs-extra')

export type PHPProjectItem = {
  id: string
  path: string
  comment: string
  phpVersion: string
  phpPath: string
  phpBin: string
  isSorting?: boolean
}

export const PHPProjectSetup = reactive<{
  fetching: boolean
  project: Array<PHPProjectItem>
  search: string
  saveProject: () => void
  fetchProject: () => void
  addProject: () => void
  delProject: (index: number) => void
  setDirEnv: (item: PHPProjectItem) => Promise<any>
}>({
  fetching: false,
  project: [],
  search: '',
  saveProject() {
    localForage
      .setItem('flyenv-php-projects', JSON.parse(JSON.stringify(PHPProjectSetup.project)))
      .then()
      .catch()
  },
  fetchProject() {
    if (PHPProjectSetup.fetching) {
      return
    }
    PHPProjectSetup.fetching = true
    localForage
      .getItem('flyenv-php-projects')
      .then((res: PHPProjectItem[]) => {
        PHPProjectSetup.project.splice(0)
        PHPProjectSetup.project.push(...res)
      })
      .catch()
      .finally(() => {
        PHPProjectSetup.fetching = false
      })
  },
  addProject() {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        const find = PHPProjectSetup.project.find((p) => p.path === path)
        if (find) {
          return
        }
        const item: PHPProjectItem = {
          id: uuid(),
          path,
          comment: '',
          phpVersion: '',
          phpPath: '',
          phpBin: ''
        }
        PHPProjectSetup.project.unshift(item)
        PHPProjectSetup.saveProject()
      })
  },
  delProject(index: number) {
    Base._Confirm(I18nT('base.delAlertContent'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        PHPProjectSetup.project.splice(index, 1)
        PHPProjectSetup.saveProject()
      })
      .catch(() => {})
  },
  async setDirEnv(item: PHPProjectItem) {
    IPC.send('app-fork:tools', 'initFlyEnvSH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 1) {
        MessageError(res?.msg ?? '')
      }
    })
    try {
      const envFile = join(item.path, '.flyenv')
      if (!item.phpVersion) {
        await writeFile(envFile, '')
      } else {
        const arr = [item.phpPath, join(item.phpPath, 'bin'), join(item.phpPath, 'sbin')].filter(
          (s) => existsSync(s)
        )
        await writeFile(
          envFile,
          `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$env:PATH = "${arr.join(';')};" + $env:PATH`
        )
      }
    } catch (e: any) {
      MessageError(e.toString())
    }
  }
})
