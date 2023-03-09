import { EventEmitter } from 'events'
import { dialog } from 'electron'
import is from 'electron-is'
import { autoUpdater } from 'electron-updater'
import { resolve } from 'path'
import logger from './Logger'
import { I18nT } from '../lang'
import type { AppUpdater } from 'electron-updater/out/AppUpdater'

if (is.dev()) {
  autoUpdater.updateConfigPath = resolve(__dirname, '../../app-update.yml')
}

export default class UpdateManager extends EventEmitter {
  options: { [key: string]: any }
  updater: AppUpdater
  autoCheckData: {
    checkEnable: boolean
    userCheck: boolean
  }
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
      this.updater.checkForUpdates().then()
    }
  }

  check() {
    this.autoCheckData.userCheck = true
    this.updater.checkForUpdates().then()
  }

  checkingForUpdate() {
    this.emit('checking')
  }

  updateAvailable(info: any) {
    this.emit('update-available', info)
    dialog
      .showMessageBox({
        type: 'info',
        title: I18nT('update.checkForUpdates'),
        message: I18nT('update.update-available-message'),
        buttons: [I18nT('update.yes'), I18nT('update.no')],
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) {
          this.updater.downloadUpdate().then()
        }
      })
  }

  updateNotAvailable(info: any) {
    this.emit('update-not-available', info)
    if (this.autoCheckData.userCheck) {
      dialog
        .showMessageBox({
          title: I18nT('update.checkForUpdates'),
          message: I18nT('update.update-not-available-message')
        })
        .then()
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
  updateDownloadProgress(event: any) {
    this.emit('download-progress', event)
  }

  updateDownloaded(info: any) {
    this.emit('update-downloaded', info)
    this.updater?.logger?.info(`Update Downloaded: ${info}`)
    dialog
      .showMessageBox({
        title: I18nT('update.checkForUpdates'),
        message: I18nT('update.update-downloaded-message')
      })
      .then(() => {
        this.emit('will-updated')
        setImmediate(() => {
          this.updater.quitAndInstall()
        })
      })
  }

  updateError(event: any, error: any) {
    this.emit('update-error', error)
    const msg = I18nT('update.update-error-message')
    dialog.showErrorBox(I18nT('update.checkForUpdates'), msg)
  }
}
