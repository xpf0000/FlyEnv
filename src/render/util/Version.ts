import { AsyncComponentShow } from '@/util/AsyncComponent'
import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import type { ModuleStaticItem } from '@/core/Module/ModuleStaticItem'

export const staticVersionDel = (item: ModuleInstalledItem | ModuleStaticItem) => {
  import('@/components/ServiceManager/delDialog.vue').then((res) => {
    AsyncComponentShow(res.default, {
      item
    }).then()
  })
}

export function versionFixed(version?: string | null) {
  return (
    version
      ?.split('.')
      ?.map((v) => {
        const vn = parseInt(v)
        if (isNaN(vn)) {
          return '0'
        }
        return `${vn}`
      })
      ?.join('.') ?? '0'
  )
}
