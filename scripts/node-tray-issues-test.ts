import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const read = (file: string) => readFile(resolve(file), 'utf8')
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const nodeWin = await read('src/fork/module/Node.win/index.ts')
const nodeStore = await read('src/render/components/Nodejs/node.ts')
const nodeSetup = await read('src/render/components/Nodejs/setup.ts')
const nodeList = await read('src/render/components/Nodejs/List.vue')
const fnmSetup = await read('src/render/components/Nodejs/fnm/setup.ts')
const nvmSetup = await read('src/render/components/Nodejs/nvm/setup.ts')
const tray = await read('src/main/ui/TrayManager.ts')
const trayApp = await read('src/render/tray/App.vue')
const application = await read('src/main/Application.ts')
const windowManager = await read('src/main/ui/WindowManager.ts')

assert(
  /if \(\(tool === 'fnm' \|\| tool === 'nvm'\) && process\.platform === 'win32'\)/.test(nodeWin),
  'Windows Node fork must reject external managers before execution'
)
assert(!/nvm root/.test(nodeWin), 'Windows startup discovery must not invoke nvm root')
assert(
  /if \(!window\.Server\.isWindows\)/.test(nodeStore),
  'Renderer tool detection must skip version managers on Windows'
)
assert(
  (nodeStore.match(/checkInstalled', 'nvm'/g) ?? []).length === 1,
  'Renderer must keep the non-Windows NVM check isolated'
)
assert(
  (nodeStore.match(/checkInstalled', 'fnm'/g) ?? []).length === 1,
  'Renderer must keep the non-Windows FNM check isolated'
)
assert(/isWindows[\s\S]*?currentTool/.test(nodeSetup), 'Node setup must expose Windows policy')
assert(
  /v-if="!isWindows" value="fnm"/.test(nodeList) && /v-if="!isWindows" value="nvm"/.test(nodeList),
  'Version-manager selectors must be hidden on Windows'
)
assert(
  /if \(!window\.Server\.isWindows\)\s*\{\s*fetchLocal\(\)\.catch\(\)/.test(nvmSetup),
  'Windows must not eagerly fetch NVM versions'
)
assert(
  /if \(!window\.Server\.isWindows\)\s*\{\s*fetchLocal\(\)\.catch\(\)/.test(fnmSetup),
  'Windows must not eagerly fetch FNM versions'
)
assert(
  /if \(!isWindows\(\)\) \{\s*this\.tray\.on\('click', this\.handleTrayClick\)\s*\}/.test(tray) &&
    (tray.match(/this\.tray\.on\('click', this\.handleTrayClick\)/g) ?? []).length === 1 &&
    /this\.tray\.on\('right-click', this\.handleTrayClick\)/.test(tray),
  'Modern tray popup must use right-click only on Windows and both mouse buttons elsewhere'
)
assert(
  /private getPopupSide\(display: Display, trayBounds: Rectangle\): TrayPopupSide \{/.test(tray) &&
    /if \(trayBounds\.y < workArea\.y\) \{\s*return 'down'\s*\}/.test(tray) &&
    /if \(trayBounds\.y \+ trayBounds\.height > areaBottom\) \{\s*return 'up'\s*\}/.test(tray) &&
    /if \(trayBounds\.x < workArea\.x\) \{\s*return 'right'\s*\}/.test(tray) &&
    /if \(trayBounds\.x \+ trayBounds\.width > areaRight\) \{\s*return 'left'\s*\}/.test(tray),
  'Tray popup side must follow the taskbar edge (top/bottom/left/right)'
)
assert(
  /this\.emit\('click', x, y, arrowOffset, !this\.show, side\)/.test(tray) &&
    /clamp\(centerX - size\.width \* 0\.5, workArea\.x, areaRight - size\.width\)/.test(tray) &&
    /clamp\(centerY - size\.height \* 0\.5, workArea\.y, areaBottom - size\.height\)/.test(tray),
  'Tray popup must stay inside the icon display on both axes'
)
assert(
  /getPopupLayout\(\)/.test(tray) &&
    /this\.syncTrayPopupLayout\(\)/.test(application) &&
    /this\.trayManager\.primePopupWindow\(\)/.test(application) &&
    /win\.setOpacity\(0\)\s*\n\s*win\.showInactive\(\)/.test(tray),
  'Tray popup must sync layout and consume the system fade off-screen before the first show'
)
assert(
  /attachWindow\(win: BrowserWindow\)/.test(tray) &&
    /this\.primed = false/.test(tray) &&
    /this\.trayManager!\.attachWindow\(window\)/.test(windowManager),
  'A rebuilt tray window must reset primed, or it would skip the off-screen fade pre-consume'
)
assert(
  /openPopup\(x: number, y: number\)/.test(tray) &&
    /closePopup\(\)/.test(tray) &&
    /private parkPosition\(\)/.test(tray) &&
    /this\.trayManager\.openPopup\(x, y\)/.test(application) &&
    /this\.trayManager\.closePopup\(\)/.test(application) &&
    /this\.trayManager!\.closePopup\(\)/.test(windowManager),
  'Tray popup visibility must be implemented by moving the window on/off screen'
)
assert(
  !/win\.hide\(\)/.test(tray) &&
    /bindCloseToHide && !this\.willQuit\) \{\s*event\.preventDefault\(\)\s*\/\/[^\n]*\n\s*this\.trayManager!\.closePopup\(\)/.test(
      windowManager
    ),
  'Tray popup must never call hide(): Windows replays a ~300ms fade on every hidden->visible'
)
assert(
  /'APP:Tray-Popup-Side'/.test(application) &&
    /'APP:Tray-Arrow-Offset'/.test(application) &&
    /side: TrayPopupSide\s*\n\s*\) \{/.test(application),
  'Main process must forward the popup side and arrow offset to the tray window'
)
assert(
  /win\.focus\(\)/.test(tray) &&
    /if \(win\.isFocused\(\)\) \{/.test(tray) &&
    /win\.blur\(\)/.test(tray),
  'Tray popup must take focus when opening and release it when closing, or clicking outside never closes it'
)
assert(
  /win\.removeListener\('blur', this\.onBlur\)\s*\n\s*win\.on\('blur', this\.onBlur\)/.test(tray),
  'Tray popup must drop the previous blur listener before arming a new one, or rapid toggles stack listeners'
)
assert(
  /:class="'popup-' \+ side"/.test(trayApp) &&
    /&\.popup-up \{/.test(trayApp) &&
    /&\.popup-down \{/.test(trayApp) &&
    /&\.popup-left \{/.test(trayApp) &&
    /&\.popup-right \{/.test(trayApp),
  'Tray window must render the arrow on all four popup sides'
)
assert(
  /import type \{ TrayPopupSide \} from '@shared\/Tray'/.test(trayApp) &&
    /return side\.value === 'up' \|\| side\.value === 'down' \? \{ left: offset \} : \{ top: offset \}/.test(
      trayApp
    ),
  'Tray arrow offset must follow the popup axis'
)

console.log('node/tray issue regression tests passed')
