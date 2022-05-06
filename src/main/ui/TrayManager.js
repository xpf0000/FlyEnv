import { EventEmitter } from 'events'
import { join } from 'path'
import { Tray, Menu, nativeTheme } from 'electron'
import is from 'electron-is'
import { translateTemplate, flattenMenuItems, updateStates } from '../utils/menu'
import Tmpl from '../menus/tray.json'

let tray = null

export default class TrayManager extends EventEmitter {
  constructor() {
    super()
    this.menu = null
    this.load()
    this.init()
    this.setup()
    this.handleEvents()
  }

  load() {
    this.template = Tmpl
    const theme = nativeTheme.shouldUseDarkColors ? 'light' : 'dark'
    if (is.macOS()) {
      this.normalIcon = join(__static, `mac_${theme}.png`)
    } else {
      this.normalIcon = join(__static, '256x256.png')
    }
  }

  build() {
    const keystrokesByCommand = {}
    for (let item in this.keymap) {
      keystrokesByCommand[this.keymap[item]] = item
    }

    // Deepclone the menu template to refresh menu
    const template = JSON.parse(JSON.stringify(this.template))
    const tpl = translateTemplate(template, keystrokesByCommand, this.i18n)
    this.menu = Menu.buildFromTemplate(tpl)
    this.items = flattenMenuItems(this.menu)
  }

  setup() {
    this.build()

    /**
     * Linux requires setContextMenu to be called
     * in order for the context menu to populate correctly
     */
    if (process.platform === 'linux') {
      tray.setContextMenu(this.menu)
    }
  }

  init() {
    tray = new Tray(this.normalIcon)
    tray.setToolTip('WebMaker')
  }

  handleEvents() {
    tray.on('click', this.handleTrayClick)
    tray.on('double-click', this.handleTrayDbClick)
    tray.on('right-click', this.handleTrayRightClick)
  }

  handleTrayClick = (event) => {
    event.preventDefault()
    global.application.toggle()
  }

  handleTrayDbClick = (event) => {
    event.preventDefault()
    global.application.show()
  }

  handleTrayRightClick = (event) => {
    event.preventDefault()
    tray.popUpContextMenu(this.menu)
  }

  updateStatus(status) {
    this.status = status
    this.updateIcon()
  }

  updateIcon() {
    const icon = this.status ? this.activeIcon : this.normalIcon
    tray.setImage(icon)
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

  destroy() {
    tray.destroy()
  }
}
