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
