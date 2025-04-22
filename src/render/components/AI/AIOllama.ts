import { AIBase } from '@/components/AI/AIBase'
import { merge } from 'lodash'
import type { ChatItem, ToolCallItem } from '@/components/AI/setup'
import { reactive } from 'vue'
import { MessageError } from '@/util/Element'
import { fileSelect } from '@/util/Index'
import { useBase64 } from '@vueuse/core'
import IPC from '@/util/IPC'
import { AISetup } from '@/components/AI/setup'
import { getAllFileAsync } from '@shared/file'

const { existsSync } = require('fs-extra')

export class AIOllama extends AIBase {
  async _HanleToolCalls(tools: ToolCallItem[]) {
    console.log('_HanleToolCalls: ', tools)
    for (const tool of tools) {
      console.log('tool: ', tool, tool.function.name)
      if (tool.function.name === 'get_folder_all_files') {
        const dir = tool.function.arguments.dir
        console.log('get_folder_all_files: ', dir, existsSync(dir))
        if (!dir || !existsSync(dir)) {
          continue
        }
        getAllFileAsync(dir).then((files) => {
          this._send({
            role: 'tool',
            name: tool.function.name,
            content: JSON.stringify({ filepaths: files })
          })
        })
      }
    }
  }

  request(param: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.streaming = true
      const baseUrl = AISetup.ollamaServer.url
      const model = AISetup.ollamaServer.model
      let messageObj: ChatItem | undefined = undefined
      let tool_calls: ToolCallItem[] | undefined
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
            // tools: [
            //   {
            //     type: 'function',
            //     function: {
            //       name: 'get_folder_all_files',
            //       description: 'Get all files in the folder',
            //       parameters: {
            //         type: 'object',
            //         properties: {
            //           dir: {
            //             type: 'string',
            //             description: 'The folder path from which to retrieve files.'
            //           }
            //         },
            //         required: ['dir']
            //       }
            //     }
            //   }
            // ]
          },
          param
        )
      }
      IPC.send('app-fork:ollama', 'chat', data, AISetup.trialStartTime).then(
        (key: string, res: any) => {
          console.log('ollama chat res: ', res)
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
            if (json.message.tool_calls) {
              if (!tool_calls) {
                tool_calls = json.message.tool_calls
              } else {
                tool_calls.push(...json.message.tool_calls)
              }
              this._HanleToolCalls(json.message.tool_calls).then().catch()
            }
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
            if (tool_calls) {
              messageObj!.tool_calls = tool_calls
            }
          }
        }
      )
    })
  }

  private _send(item: ChatItem) {
    const messages = [...this.chatList].filter((f) => !f.error && f.role !== 'system')
    const arr: ChatItem[] = []
    arr.push(reactive(item))
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

  send() {
    if (!this.content.trim()) {
      return
    }
    this._send({
      role: 'user',
      content: this.content
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
          this._send({
            role: 'user',
            content: '',
            images
          })
        })
      }
    })
  }
}
