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
const ipcHandler = await read('src/main/core/IPCHandler.ts')

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
  /lastBlurCloseAt/.test(tray) &&
    /!this\.show && Date\.now\(\) - this\.lastBlurCloseAt < 350/.test(tray),
  'Tray click must ignore the click that follows a blur-triggered close, or the popup reopens instantly'
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
  /pushPopupLayout\(\)/.test(tray) && /this\.trayManager\.pushPopupLayout\(\)/.test(application),
  'Tray popup must sync layout before the first show'
)
assert(
  /attachWindow\(win: BrowserWindow\)/.test(tray) &&
    /this\.alwaysOnTopArmed = false/.test(tray) &&
    /win\.setOpacity\(0\)/.test(tray) &&
    /this\.trayManager!\.attachWindow\(window\)/.test(windowManager),
  'A rebuilt tray window must reset state flags and start fully transparent through attachWindow'
)
assert(
  /openPopup\(x: number, y: number, side: TrayPopupSide, arrowOffset: number\)/.test(tray) &&
    /closePopup\(\)/.test(tray) &&
    /this\.trayManager\.openPopup\(x, y, side, arrowOffset\)/.test(application) &&
    /this\.trayManager\.closePopup\(\)/.test(application) &&
    /this\.trayManager!\.closePopup\(\)/.test(windowManager),
  'Tray popup open/close must go through TrayManager'
)
assert(
  /win\.setOpacity\(0\)\s*\n\s*win\.hide\(\)/.test(tray),
  'Tray popup must fully hide() when closed: an invisible opacity-0 window still intercepts clicks (issue #869)'
)
assert(
  /win\.show\(\)\s*\n\s*\}[\s\S]*?win\.setOpacity\(1\)/.test(tray),
  'Tray popup must show() at opacity 0 and restore opacity after, so the Windows show-fade plays invisibly'
)
assert(
  /await this\.syncPopupLayout\(side, arrowOffset\)/.test(tray) &&
    /notifyLayoutApplied\(nonce: number\)/.test(tray) &&
    /'APP:Tray-Popup-Layout-Applied'/.test(ipcHandler) &&
    !/'APP:Tray-Popup-Side'/.test(application) &&
    !/'APP:Tray-Arrow-Offset'/.test(application) &&
    /win\.focus\(\)[\s\S]*?win\.setOpacity\(1\)/.test(tray),
  'Popup layout must be acknowledged by the renderer and focus must happen before the final reveal'
)
assert(
  /IPC\.on\('APP:Tray-Popup-Layout'\)/.test(trayApp) &&
    /IPC\.send\('APP:Tray-Popup-Layout-Applied', res\?\.nonce \?\? 0\)/.test(trayApp),
  'Tray renderer must apply the combined layout message and send back the nonce ack'
)
assert(
  /!this\.alwaysOnTopArmed/.test(tray) &&
    /win\.setAlwaysOnTop\(true, 'screen-saver'\)\s*\n\s*this\.alwaysOnTopArmed = true/.test(tray),
  'Always-on-top must be armed only once, not re-toggled on every open'
)
assert(
  !/win\.setPosition\(/.test(tray) &&
    /private popupSize = \{ width: 270, height: 435 \}/.test(tray) &&
    (tray.match(/win\.setBounds\(\{ x: [^,]+, y: [^,]+, \.\.\.this\.popupSize \}\)/g) ?? [])
      .length === 1 &&
    /const size = this\.popupSize/.test(tray),
  'Popup moves must pin the size via setBounds: bare setPosition grows the window 1-2px per call on Win11 fractional DPI'
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
