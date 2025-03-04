import { AIBase } from '@/components/AI/AIBase'
import { merge } from 'lodash'
import type { ChatItem } from '@/components/AI/setup'
import { reactive } from 'vue'
import { MessageError } from '@/util/Element'
import { fileSelect } from '@/util/Index'
import { useBase64 } from '@vueuse/core'
import IPC from '@/util/IPC'
import { AISetup } from '@/components/AI/setup'

export class AIOllama extends AIBase {
  request(param: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.streaming = true
      const baseUrl = AISetup.ollamaServer.url
      const model = AISetup.ollamaServer.model
      let messageObj: ChatItem | undefined = undefined
      let message = ''
      const data = {
        url: `${baseUrl}/api/chat`,
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'post',
        responseType: 'stream',
        data: merge(
          {
            model: model,
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
              content: message,
              model
            } as any)
            this.chatList.push(messageObj!)
          } else {
            messageObj.content = message
          }
        }
      })
    })
  }

  send() {
    if (!this.content.trim()) {
      return
    }

    const messages = [...this.chatList].filter((f) => !f.error && f.role !== 'system')
    const arr: ChatItem[] = []
    arr.push(
      reactive({
        role: 'user',
        content: this.content
      })
    )
    messages.push(...arr)
    messages.unshift({
      role: 'system',
      content: this.prompt
    })
    this.chatList.push(...arr)
    this.content = ''
    this.request({ messages })
      .then()
      .catch((e: any) => {
        arr.forEach((a) => (a.error = `${e}`))
      })
      .finally(() => {
        AISetup.save()
      })
  }

  sendNotMake() {
    if (!this.content.trim()) {
      return
    }

    this.chatList.push(
      reactive({
        role: 'user',
        content: this.content
      })
    )
    this.content = ''
  }

  sendImage() {
    fileSelect('image/*', true).then((files: FileList) => {
      console.log('choosePath files: ', files)
      if (files.length > 0) {
        const all = Array.from(files).map((file) => useBase64(file).execute())
        Promise.all(all).then((images) => {
          const messages = [...this.chatList].filter((f) => !f.error && f.role !== 'system')
          const arr: ChatItem[] = []
          arr.push(
            reactive({
              role: 'user',
              content: '',
              images
            })
          )
          messages.push(...arr)
          messages.unshift({
            role: 'system',
            content: this.prompt
          })
          this.chatList.push(...arr)
          this.request({ messages })
            .then()
            .catch((e: any) => {
              arr.forEach((a) => (a.error = `${e}`))
            })
            .finally(() => {
              AISetup.save()
            })
        })
      }
    })
  }
}
