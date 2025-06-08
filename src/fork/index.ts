import { AppI18n } from '@lang/index'
import BaseManager from './BaseManager'
const manager = new BaseManager()
process.on('message', function (args: any) {
  if (args.Server) {
    global.Server = args.Server
    if (window.Server.LangCustomer) {
      AppI18n().global.setLocaleMessage(window.Server.Lang!, window.Server.LangCustomer)
    }
    AppI18n(args.Server.Lang)
    manager.init()
  } else {
    manager.exec(args)
  }
})
export {}
