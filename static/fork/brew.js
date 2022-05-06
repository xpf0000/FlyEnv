const Manager = require('./BrewManager.js')
let manager = new Manager()
process.on('message', function (args) {
  if (args.Server) {
    global.Server = args.Server
  } else {
    manager.exec(args)
  }
})
