import { reactive } from 'vue'
import type { SoftInstalled } from '@web/store/brew'
import { I18nT } from '@shared/lang'
import { MessageSuccess } from '@/util/Element'
import { dirname } from '@web/fn'
import type { AllAppModule } from '@web/core/type'

export const ServiceActionStore: {
  versionDeling: Record<string, boolean>
  pathSeting: Record<string, boolean>
  allPath: string[]
  pathDict: Record<AllAppModule, string>
  fetchPathing: boolean
  fetchPath: () => void
  updatePath: (item: SoftInstalled, typeFlag: string) => void
} = reactive({
  versionDeling: {},
  pathSeting: {},
  allPath: [],
  pathDict: {},
  fetchPathing: false,
  fetchPath() {},
  updatePath(item: SoftInstalled, typeFlag: AllAppModule) {
    const old = this.pathDict?.[typeFlag]
    const bin: string = dirname(item.bin)
    console.log('updatePath: ', bin, old, this.allPath)
    if (old === bin) {
      const index = this.allPath.indexOf(bin)
      if (index >= 0) {
        this.allPath.splice(index, 1)
      }
      delete this.pathDict?.[typeFlag]
    } else {
      const index = this.allPath.indexOf(old)
      if (index >= 0) {
        this.allPath.splice(index, 1)
      }
      this.pathDict[typeFlag] = bin
      this.allPath.unshift(bin)
    }
    MessageSuccess(I18nT('base.success'))
  }
} as any)
