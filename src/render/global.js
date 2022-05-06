import Emitter from 'tiny-emitter'
const { ipcRenderer } = require('electron')
export const EventBus = new Emitter()
export { ipcRenderer }
