const { contextBridge, ipcRenderer } = require('electron') // 使用 require

contextBridge.exposeInMainWorld('FlyEnvNodeAPI', {
  ipcSendToMain: (...args) => ipcRenderer.send('command', ...args),
  ipcReceiveFromMain: (callback) => ipcRenderer.on('command', callback)
})
