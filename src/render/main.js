import { VueExtend } from './core/VueExtend.js'
import App from './App.vue'
import store from '@/store/index.js'
import '@/components/Theme/Index.scss'
import IPC from '@/util/IPC.js'
VueExtend(App).mount('#app')
IPC.on('APP-Ready-To-Show').then(() => {
  console.log('APP-Ready-To-Show !!!!!!')
  store.dispatch('app/initConfig')
  store.dispatch('app/initHost')
})
