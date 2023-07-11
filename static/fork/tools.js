const { exec } = require('child-process-promise')
const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join } = require('path')
const { readFileSync, writeFile } = require('fs')
const Utils = require('./Utils.js')
const TaskQueue = require('./TaskQueue/TaskQueue.js')

class BomCleanTask {
  path = ''
  constructor(path) {
    this.path = path
  }
  run() {
    return new Promise((resolve, reject) => {
      const path = this.path
      let buff = readFileSync(path)
      if (
        buff[0].toString(16).toLowerCase() === 'ef' &&
        buff[1].toString(16).toLowerCase() === 'bb' &&
        buff[2].toString(16).toLowerCase() === 'bf'
      ) {
        buff = buff.slice(3)
        writeFile(path, buff, 'binary', (err) => {
          if (err) {
            reject(err)
          } else {
            resolve(true)
          }
        })
      }
    })
  }
}

class Manager extends BaseManager {
  constructor() {
    super()
  }

  getAllFile(fp, fullpath = true) {
    const files = Utils.getAllFile(fp, fullpath)
    this._processSend({
      code: 0,
      msg: 'Success',
      files
    })
  }

  cleanBom(files) {
    const taskQueue = new TaskQueue()
    taskQueue
      .progress((progress) => {
        this._processSend({
          code: 200,
          progress
        })
      })
      .end(() => {
        this._processSend({
          code: 0,
          msg: 'Success'
        })
      })
      .initQueue(
        files.map((p) => {
          return new BomCleanTask(p)
        })
      )
      .run()
  }
}

let manager = new Manager()
process.on('message', function (args) {
  if (args.Server) {
    global.Server = args.Server
    AppI18n(global.Server.Lang)
  } else {
    manager.exec(args)
  }
})
