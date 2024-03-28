import type { LinkItem } from './LinkItem'

export type StoreType = {
  Pages: LinkItem[]
  Links: LinkItem[]
  url: string
  host: string
  dir: string
  cookie: string
  reinit: () => void
  LoadedUrl: string[]
  ExcludeUrl: Set<string>
}

export const Store: StoreType = {
  Pages: [],
  Links: [],
  url: '',
  host: '',
  dir: '',
  cookie: '',
  LoadedUrl: [],
  ExcludeUrl: new Set(),
  reinit() {
    this.Pages.splice(0)
    this.Links.splice(0)
    this.url = ''
    this.host = ''
    this.dir = ''
    this.cookie = ''
  }
}
