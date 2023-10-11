import { Server } from 'http'

export interface StaticHttpServe {
  server: Server
  port: number
  host: Array<string>
}
export interface PtyLast {
  command: string
  key: string
}
