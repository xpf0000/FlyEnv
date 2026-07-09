import { AsyncComponentShow } from '@/util/AsyncComponent'
import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import type { ModuleStaticItem } from '@/core/Module/ModuleStaticItem'
import type { CallbackFn } from '@shared/app'

export const staticVersionDel = (
  item: ModuleInstalledItem | ModuleStaticItem,
  onDone?: CallbackFn
) => {
  import('@/components/ServiceManager/delDialog.vue')
    .then((res) => {
      AsyncComponentShow(res.default, {
        item,
        onDone
      }).then()
    })
    .catch(() => {
      onDone?.()
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
      ?.slice(0, 3)
      ?.join('.') ?? '0'
  )
}
