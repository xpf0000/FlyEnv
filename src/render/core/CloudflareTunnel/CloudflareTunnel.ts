import axios, { AxiosInstance } from 'axios'

export class CloudflareTunnel {
  apiToken: string = ''
  accountId: string = ''
  subdomain: string = ''
  localService: string = ''

  pid: string = ''
  run: boolean = false
  running: boolean = false

  private _client!: AxiosInstance

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  client() {
    if (!this._client) {
      this._client = axios.create({
        baseURL: 'https://api.cloudflare.com/client/v4',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      })
    }
    return this._client
  }

  /**
   * 获取所有的Zone
   */
  async fetchAllZone() {}
}
