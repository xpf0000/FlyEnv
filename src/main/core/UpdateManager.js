import { EventEmitter } from 'events'
import { dialog } from 'electron'
import is from 'electron-is'
import { autoUpdater } from 'electron-updater'
import { resolve } from 'path'
import logger from './Logger'

if (is.dev()) {
  autoUpdater.updateConfigPath = resolve(__dirname, '../../app-update.yml')
}

export default class UpdateManager extends EventEmitter {
  constructor(options = {}) {
    super()
    this.options = options
    this.updater = autoUpdater
    this.updater.autoDownload = false
    this.updater.logger = logger
    this.autoCheckData = {
      checkEnable: true,
      userCheck: false
    }
    this.init()
  }

  init() {
    this.updater.on('checking-for-update', this.checkingForUpdate.bind(this))
    this.updater.on('update-available', this.updateAvailable.bind(this))
    this.updater.on('update-not-available', this.updateNotAvailable.bind(this))
    this.updater.on('download-progress', this.updateDownloadProgress.bind(this))
    this.updater.on('update-downloaded', this.updateDownloaded.bind(this))
    this.updater.on('error', this.updateError.bind(this))

    if (this.autoCheckData.checkEnable) {
      this.autoCheckData.userCheck = false
      this.updater.checkForUpdates()
    }
  }

  check() {
    this.autoCheckData.userCheck = true
    this.updater.checkForUpdates()
  }

  checkingForUpdate() {
    this.emit('checking')
  }

  updateAvailable(event, info) {
    this.emit('update-available', info)
    dialog
      .showMessageBox({
        type: 'info',
        title: '检查更新',
        message: '发现新版本，是否现在更新？',
        buttons: ['是', '否'],
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) {
          this.updater.downloadUpdate()
        }
      })
  }

  updateNotAvailable(event, info) {
    this.emit('update-not-available', info)
    if (this.autoCheckData.userCheck) {
      dialog.showMessageBox({
        title: '检查更新',
        message: '已是最新版'
      })
    }
  }

  /**
   * autoUpdater:download-progress
   * @param {Object} event
   * progress,
   * bytesPerSecond,
   * percent,
   * total,
   * transferred
   */
  updateDownloadProgress(event) {
    this.emit('download-progress', event)
  }

  updateDownloaded(event, info) {
    this.emit('update-downloaded', info)
    this.updater.logger.log(`Update Downloaded: ${info}`)
    dialog
      .showMessageBox({
        title: '检查更新',
        message: '更新下载完成，应用程序将退出并开始更新...'
      })
      .then((_) => {
        this.emit('will-updated')
        setImmediate(() => {
          this.updater.quitAndInstall()
        })
      })
  }

  updateError(event, error) {
    this.emit('update-error', error)
    const msg = error == null ? '检查更新失败' : (error.stack || error).toString()

    this.updater.logger.warn(`[Motrix] update-error: ${msg}`)
    dialog.showErrorBox(msg)
  }
}
