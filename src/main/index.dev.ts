import debugFn from 'electron-debug'
import App from './index'

debugFn({
  showDevTools: true
})

App()

export {}
