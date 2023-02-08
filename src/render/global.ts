import Emitter from 'tiny-emitter'
const { ipcRenderer } = require('electron')
// @ts-ignore
export const EventBus = new Emitter()
export { ipcRenderer }
