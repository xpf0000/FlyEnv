import type { ChatItem } from '@/components/AI/setup'

export class AIBase {
  model: string = ''
  id: string = ''
  title: string = ''
  prompt: string = ''
  chatList: ChatItem[] = []
  streaming: boolean = false
  content: string = ''
  temperature: number = 0.7
  baseUrl = ''

  private _checkFns: Function[] = []

  constructor(obj?: any) {
    Object.assign(this, obj)
  }

  onStreamEnd() {
    this.streaming = false
    this._checkFns.forEach((f) => f(true))
    this._checkFns.splice(0)
  }
  checkEnd() {
    return new Promise((resolve) => {
      if (!this.streaming) {
        resolve(true)
        this._checkFns.forEach((f) => f(true))
        this._checkFns.splice(0)
      } else {
        this._checkFns.push(resolve)
      }
    })
  }

  request(param: any): Promise<boolean> {
    return param && Promise.resolve(true)
  }

  updatePrompt() {}

  send() {}

  sendDoc() {}

  sendImage() {}
}
