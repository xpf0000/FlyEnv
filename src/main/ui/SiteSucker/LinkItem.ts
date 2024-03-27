const NoticeDict: { [k: string]: number } = {}

const NoticeOrder = {
  wait: 0,
  running: 1,
  fail: 2,
  replace: 3,
  success: 4
}

export type LinkState = 'wait' | 'running' | 'success' | 'fail'

export type PageLink = {
  url: string
  saveFile: string
  state: LinkState
  type?: string
  size?: number
  retry?: number
}

export const CallBack: {
  fn: Function
} = {
  fn: () => {}
}

export class LinkItem implements PageLink {
  saveFile: string
  _state: LinkState
  url: string
  type?: string
  size?: number
  retry?: number

  constructor(item: PageLink) {
    this.saveFile = ''
    this._state = 'wait'
    this.url = ''
    Object.assign(this, item)
    this.notice()
  }

  notice() {
    const order = NoticeOrder[this._state]
    const noticeOrder = NoticeDict?.[this.url] ?? -1
    if (noticeOrder < order) {
      NoticeDict[this.url] = order
      CallBack.fn({
        url: this.url,
        state: this._state,
        type: this.type,
        size: this.size
      })
    }
  }

  get state() {
    return this._state
  }
  set state(v) {
    this._state = v
    this.notice()
  }
}
