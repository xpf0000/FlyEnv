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
  /onBlur\(event: Event\)/.test(tray) &&
    /if \(!this\.clicking\) \{\s*this\.lastBlurCloseAt = Date\.now\(\)\s*this\.closePopup\(\)\s*\}/.test(
      tray
    ) &&
    /win\.on\('blur', this\.onBlur\)/.test(tray) &&
    /Date\.now\(\) - this\.lastBlurCloseAt < 350/.test(tray) &&
    !/win\.focus\(\)/.test(tray),
  'Tray popup must close on blur and suppress the same tray click from reopening it, without forcing focus'
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
    /this\.trayManager!\.attachWindow\(window\)/.test(windowManager),
  'A rebuilt tray window must re-bind through attachWindow so show state resets'
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
  !/win\.setOpacity\(/.test(tray) &&
    !/setIgnoreMouseEvents/.test(tray) &&
    !/win\.focus\(\)/.test(tray) &&
    !/primePopupWindow|parkPosition/.test(tray) &&
    /win\.show\(\)/.test(tray) &&
    /win\.hide\(\)/.test(tray),
  'Tray popup must use plain show()/hide() with no focus/opacity/park tricks: all break display of a transparent frameless window'
)
assert(
  /await this\.syncPopupLayout\(side, arrowOffset\)/.test(tray) &&
    /notifyLayoutApplied\(nonce: number\)/.test(tray) &&
    /nonce: this\.layoutNonce/.test(tray) &&
    /'APP:Tray-Popup-Layout-Applied'/.test(ipcHandler) &&
    /IPC\.send\('APP:Tray-Popup-Layout-Applied', res\?\.nonce \?\? 0\)/.test(trayApp) &&
    !/'APP:Tray-Popup-Side'/.test(application) &&
    !/'APP:Tray-Arrow-Offset'/.test(application),
  'Popup layout must round-trip through the combined layout message with a renderer ack before showing'
)
assert(
  /IPC\.on\('APP:Tray-Popup-Layout'\)/.test(trayApp),
  'Tray renderer must apply the combined layout message'
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
