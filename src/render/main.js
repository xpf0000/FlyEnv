import { VueExtend } from './core/VueExtend.js'
import App from './App.vue'
import store from '@/store/index.js'
import '@/components/Theme/Index.scss'
import IPC from '@/util/IPC.js'
const { getGlobal } = require('@electron/remote')
global.Server = getGlobal('Server')
let inited = false
IPC.on('APP-Ready-To-Show').then(() => {
  console.log('APP-Ready-To-Show !!!!!!')
  if (!inited) {
    inited = true
    Promise.all([store.dispatch('app/initConfig'), store.dispatch('app/initHost')]).then(() => {
      VueExtend(App).mount('#app')
    })
  } else {
    console.log('has inited !!!!')
  }
})
