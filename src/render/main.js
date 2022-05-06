import { VueExtend } from './core/VueExtend.js'
import App from './App.vue'
import store from '@/store/index.js'
import '@/components/Theme/Index.scss'
store.dispatch('app/initConfig')
store.dispatch('app/initHost')
VueExtend(App).mount('#app')
