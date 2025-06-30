const { contextBridge, ipcRenderer, webUtils } = require('electron') // 使用 require

contextBridge.exposeInMainWorld('FlyEnvNodeAPI', {
  ipcSendToMain: (...args) => ipcRenderer.send('command', ...args),
  ipcReceiveFromMain: (callback) => ipcRenderer.on('command', callback),
  showFilePath: (file) => {
    return webUtils.getPathForFile(file)
  }
})
