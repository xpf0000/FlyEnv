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
    const item: ChatItem = reactive({
      role: 'system',
      content: this.prompt
    })
    const messages = [...this.chatList].filter((f) => !f.error)
    messages.push(item)
    this.chatList.push(item)
    this.request({ messages })
      .then()
      .catch(() => {
        item.error = true
      })
  }

  send() {
    if (!this.content.trim()) {
      return
    }
    const successedPrompt = this.chatList.find(
      (f) => !f.error && f.role === 'system' && f.content === this.prompt
    )
    const messages = [...this.chatList].filter((f) => !f.error)
    const arr: ChatItem[] = []
    if (!successedPrompt) {
      arr.push(
        reactive({
          role: 'system',
          content: this.prompt
        })
      )
    }
    arr.push(
      reactive({
        role: 'user',
        content: this.content
      })
    )
    messages.push(...arr)
    this.chatList.push(...arr)
    this.content = ''
    this.request({ messages })
      .then()
      .catch(() => {
        arr.forEach((a) => (a.error = true))
      })
  }

  sendImage() {
    fileSelect('image/*', true).then((files: FileList) => {
      console.log('choosePath files: ', files)
      if (files.length > 0) {
        const all = Array.from(files).map((file) => useBase64(file).execute())
        Promise.all(all).then((images) => {
          const successedPrompt = this.chatList.find(
            (f) => !f.error && f.role === 'system' && f.content === this.prompt
          )
          const messages = [...this.chatList].filter((f) => !f.error)
          const arr: ChatItem[] = []
          if (!successedPrompt) {
            arr.push(
              reactive({
                role: 'system',
                content: this.prompt
              })
            )
          }
          arr.push(
            reactive({
              role: 'user',
              content: '',
              images
            })
          )
          messages.push(...arr)
          this.chatList.push(...arr)
          this.request({ messages })
            .then()
            .catch(() => {
              arr.forEach((a) => (a.error = true))
            })
        })
      }
    })
  }
}
