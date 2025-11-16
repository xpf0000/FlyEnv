import { BrewStore, OnlineVersionItem } from '@/store/brew'
import { clipboard } from '@/util/NodeFn'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { staticVersionDel } from '@/util/Version'
import type { AllAppModule } from '@/core/type'

export class ModuleStaticItem implements OnlineVersionItem {
  typeFlag: AllAppModule = 'dns'
  mVersion: string = ''
  url: string = ''
  version: string = ''
  appDir: string = ''
  bin: string = ''
  downing: boolean = false
  downloaded: boolean = false
  installed: boolean = false
  zip: string = ''
  name: string = ''

  constructor(item: any) {
    Object.assign(this, item)
  }

  fetchCommand() {
    return this.url
  }

  copyCommand() {
    const command = this.fetchCommand()
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  runCommand() {
    return new Promise((resolve) => {
      if (!this.installed) {
        if (this.downing) {
          resolve(false)
          return
        }
        this.downing = true
        const brewStore = BrewStore()
        const module = brewStore.module(this.typeFlag)
        module.staticDowing.push(this)
        IPC.send(`app-fork:${this.typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(this))).then(
          (key: string, res: any) => {
            console.log('res: ', res)
            if (res?.code === 200) {
              Object.assign(this, res.msg)
            } else if (res?.code === 0) {
              IPC.off(key)
              this.downing = false
              module.staticDowing = module.staticDowing.filter(
                (s) => s.url !== this.url && s.bin !== this.bin
              )
              resolve(true)
            } else {
              IPC.off(key)
              module.staticDowing = module.staticDowing.filter(
                (s) => s.url !== this.url && s.bin !== this.bin
              )
              resolve(false)
            }
          }
        )
      } else {
        staticVersionDel(this)
        resolve(false)
      }
    })
  }
}
