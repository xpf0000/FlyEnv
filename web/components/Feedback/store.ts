import { reactive } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import { waitTime } from '@web/fn'

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
  init() {},
  send() {
    return new Promise(async (resolve, reject) => {
      if (this.time > 0 || this.loading) {
        reject(new Error('Wait'))
        return
      }
      if (this.message.length < 5 || this.message.length > 1024) {
        MessageError(I18nT('feedback.messagelengthErr'))
        reject(new Error('Message length is 5 - 1024'))
        return
      }
      this.loading = true
      await waitTime()
      MessageSuccess(I18nT('base.success'))
      this.run()
      resolve(true)
    })
  }
})
