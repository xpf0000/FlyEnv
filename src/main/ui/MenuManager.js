import { EventEmitter } from 'events'
import { Menu } from 'electron'
import { flattenMenuItems, translateTemplate, updateStates } from '../utils/menu'
import MenuDarwin from '../menus/darwin.json'
import MenuWin32 from '../menus/win32.json'

const menuTmpl = {
  darwin: MenuDarwin,
  win32: MenuWin32
}

export default class MenuManager extends EventEmitter {
  constructor() {
    super()
    this.keymap = {}
    this.items = {}
    this.load()
    this.setup()
  }

  load() {
    const platform = process.platform
    console.log('platform: ', platform)
    let template = menuTmpl[platform]
    this.template = template['menu']
  }

  build() {
    const keystrokesByCommand = {}
    for (let item in this.keymap) {
      keystrokesByCommand[this.keymap[item]] = item
    }

    // Deepclone the menu template to refresh menu
    const template = JSON.parse(JSON.stringify(this.template))
    const tpl = translateTemplate(template, keystrokesByCommand)
    return Menu.buildFromTemplate(tpl)
  }

  setup() {
    const menu = this.build()
    Menu.setApplicationMenu(menu)
    this.items = flattenMenuItems(menu)
  }

  rebuild() {
    this.setup()
  }

  updateMenuStates(visibleStates, enabledStates, checkedStates) {
    updateStates(this.items, visibleStates, enabledStates, checkedStates)
  }

  updateMenuItemVisibleState(id, flag) {
    const visibleStates = {
      [id]: flag
    }
    this.updateMenuStates(visibleStates, null, null)
  }

  updateMenuItemEnabledState(id, flag) {
    const enabledStates = {
      [id]: flag
    }
    this.updateMenuStates(null, enabledStates, null)
  }
}
