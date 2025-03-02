import { AIBase } from '@/components/AI/AIBase'
import { merge } from 'lodash'
import type { ChatItem } from '@/components/AI/setup'
import { reactive } from 'vue'
import { MessageError } from '@/util/Element'
import { fileSelect } from '@/util/Index'
import { useBase64 } from '@vueuse/core'
import IPC from '@/util/IPC'

export class AIOllama extends AIBase {
  request(param: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.streaming = true
      let messageObj: ChatItem | undefined = undefined
      let message = ''
      const data = {
        url: `${this.baseUrl}/api/chat`,
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'post',
        responseType: 'stream',
        data: merge(
          {
            model: 'deepseek-r1:1.5b',
            stream: true,
            messages: [],
            options: {
              temperature: this.temperature
            }
          },
          param
        )
      }
      IPC.send('app-fork:ollama', 'chat', data).then((key: string, res: any) => {
        if (res?.code === 0) {
          IPC.off(key)
          this.onStreamEnd()
          resolve(true)
        } else if (res?.code === 1) {
          IPC.off(key)
          MessageError(res?.msg)
          reject(new Error(res?.msg))
        } else if (res?.code === 200) {
          const json: any = res.msg
          message += json.message.content
          if (!messageObj) {
            messageObj = reactive({
              role: 'assistant',
              content: message
            } as any)
            this.chatList.push(messageObj!)
          } else {
            messageObj.content = message
          }
        }
      })
    })
  }
  updatePrompt() {
    const messages = [...this.chatList]
    messages.push({
      role: 'system',
      content: this.prompt
    })
    this.request({ messages }).then().catch()
  }

  send() {
    if (!this.content.trim()) {
      return
    }
    const messages = [...this.chatList]
    messages.push({
      role: 'user',
      content: this.content
    })
    const content = this.content
    this.content = ''
    this.request({ messages })
      .then()
      .catch(() => {
        this.content = content
      })
  }

  sendImage() {
    fileSelect('image/*', true).then((files: FileList) => {
      console.log('choosePath files: ', files)
      if (files.length > 0) {
        const all = Array.from(files).map((file) => useBase64(file).execute())
        Promise.all(all).then((images) => {
          const messages = [...this.chatList]
          messages.push({
            role: 'user',
            content: '',
            images
          })
          this.request({ messages }).then().catch()
        })
      }
    })
  }
}
