import Base from '@/core/Base'
import { I18nT } from '@lang/index'
import { shell } from '@/util/NodeFn'

export const staticVersionDel = (dir: string) => {
  Base._Confirm(I18nT('service.staticDelAlert'), undefined, {
    customClass: 'confirm-del',
    type: 'warning'
  })
    .then(() => {
      shell.showItemInFolder(dir)
    })
    .catch(() => {})
}
