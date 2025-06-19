/**
 * This file is used specifically and only for development. It installs
 * `electron-debug` & `vue-devtools`. There shouldn't be any need to
 *  modify this file, but it can be used to extend your development
 *  environment.
 */

/* eslint-disable */

// Install `electron-debug` with `devtron`
require('electron-debug')({
  // devToolsMode: 'right',
  showDevTools: true
})

// Install `vue-devtools`
require('electron').app.on('ready', () => {
    console.log('electron ready !!!!!!')
  let installExtension = require('electron-devtools-installer')
    const vue_devtools_beta = { id: "ljjemllljcmogpfapbkkighbhhppjdbg", electron: ">=1.2.1" }

    // 添加超时机制，避免阻塞启动
    const installTimeout = setTimeout(() => {
      console.log('Vue DevTools installation timeout, continuing without it...')
    }, 5000)

    installExtension.default(vue_devtools_beta)
    .then(() => {
        clearTimeout(installTimeout)
        console.log('VUEJS_DEVTOOLS !!!')
    })
    .catch((err: Error) => {
      clearTimeout(installTimeout)
      console.log('Unable to install `vue-devtools`, continuing without it: \n', err.message)
    })
})

// Require `main` process to boot app
require('./index')

export {}
