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
  !/this\.tray\.on\('click', this\.handleTrayClick\)/.test(tray) &&
    /this\.tray\.on\('right-click', this\.handleTrayClick\)/.test(tray),
  'Modern tray popup must be bound to right-click only'
)

console.log('node/tray issue regression tests passed')
