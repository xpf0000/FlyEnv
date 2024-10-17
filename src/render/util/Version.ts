import Base from '@/core/Base'
import { I18nT } from '@shared/lang'

const { shell } = require('@electron/remote')
const { existsSync } = require('fs')

export const staticVersionDel = (dir: string) => {
  Base._Confirm(I18nT('base.staticDelAlert'), undefined, {
    customClass: 'confirm-del',
    type: 'warning'
  })
    .then(() => {
      if (existsSync(dir)) {
        shell.showItemInFolder(dir)
      }
    })
    .catch(() => {})
}
