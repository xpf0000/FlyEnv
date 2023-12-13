import { VueExtend } from './VueExtend'
import App from './App.vue'
import '../src/render/components/Theme/Index.scss'

const app = VueExtend(App)
app.mount('#app')
