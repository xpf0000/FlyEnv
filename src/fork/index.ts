import { AppI18n } from './lang'
import BaseManager from './BaseManager'
const manager = new BaseManager()
process.on('message', function (args: any) {
  if (args.Server) {
    global.Server = args.Server
    AppI18n(args.Server.Lang)
    manager.init()
  } else {
    manager.exec(args).then()
  }
})
export {}
