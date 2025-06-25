import { EventEmitter } from 'events'
import { Menu } from 'electron'
import { flattenMenuItems, translateTemplate, updateStates } from '../utils/menu'
import MenuDarwin from '../menus/darwin.json'
import { isWindows } from '@shared/utils'

export default class MenuManager extends EventEmitter {
  items: { [key: string]: any }
  template: { [key: string]: any }
  constructor() {
    super()
    this.items = {}
    this.template = {}
    if (isWindows()) {
      return
    }
    this.load()
    this.setup()
  }

  load() {
    this.template = MenuDarwin['menu']
  }

  build() {
    const keystrokesByCommand = {}
    // Deepclone the menu template to refresh menu
    const template = JSON.parse(JSON.stringify(this.template))
    const tpl = translateTemplate(template, keystrokesByCommand)
    return Menu.buildFromTemplate(tpl)
  }

  setup() {
    if (isWindows()) {
      return
    }
    const menu = this.build()
    Menu.setApplicationMenu(menu)
    this.items = flattenMenuItems(menu)
  }

  rebuild() {
    this.setup()
  }

  updateMenuStates(visibleStates: any, enabledStates: any, checkedStates: any) {
    if (isWindows()) {
      return
    }
    updateStates(this.items, visibleStates, enabledStates, checkedStates)
  }

  updateMenuItemVisibleState(id: string, flag: any) {
    const visibleStates = {
      [id]: flag
    }
    this.updateMenuStates(visibleStates, null, null)
  }

  updateMenuItemEnabledState(id: string, flag: any) {
    const enabledStates = {
      [id]: flag
    }
    this.updateMenuStates(null, enabledStates, null)
  }
}
