import { reactive } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import IPC from '@/util/IPC'

const { app } = require('@electron/remote')
const version = app.getVersion()

export const FeedbackStore = reactive({
  email: '',
  country: '',
  message: '',
  time: 0,
  loading: false,
  run(time?: number) {
    this.time = time ?? 30
    let timer: any
    const doRun = () => {
      if (this.time === 0) {
        clearInterval(timer)
        timer = undefined
        return
      }
      this.time -= 1
    }
    timer = setInterval(doRun, 1000)
  },
  init() {
    const cache = localStorage.getItem('App-Feedback')
    if (cache) {
      const obj = JSON.parse(cache)
      Object.assign(this, obj)
      const time = Math.round(new Date().getTime() / 1000)
      const diffTime = time - obj.sendTime
      if (diffTime < 30) {
        this.time = 30 - diffTime
        this.run(this.time)
      }
    }
  },
  send() {
    return new Promise((resolve, reject) => {
      if (this.time > 0 || this.loading) {
        reject(new Error('Wait'))
        return
      }
      if (this.message.trim().length < 5 || this.message.trim().length > 1024) {
        MessageError(I18nT('feedback.messagelengthErr'))
        reject(new Error('Message length is 5 - 1024'))
        return
      }
      this.loading = true
      const data = {
        email: this.email,
        country: this.country,
        message: this.message.trim(),
        version
      }
      IPC.send('app-fork:app', 'feedback', data).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          localStorage.setItem(
            'App-Feedback',
            JSON.stringify({
              email: data.email,
              country: data.country,
              sendTime: Math.round(new Date().getTime() / 1000)
            })
          )
          MessageSuccess(I18nT('base.success'))
          this.run()
          resolve(true)
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
          reject(new Error('Fail'))
        }
        this.loading = false
      })
    })
  }
})
FeedbackStore.init()
