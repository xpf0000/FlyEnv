const Manager = require('./HostManager')
const { AppI18n } = require('./lang/index')
let manager = new Manager()
process.on('message', function (args) {
  if (args.Server) {
    global.Server = args.Server
    AppI18n(global.Server.Lang)
  } else {
    manager.exec(args)
  }
})
