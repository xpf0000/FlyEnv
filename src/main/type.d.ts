import { Server } from 'http'
import type { IPty } from 'node-pty'
import type { PItem } from '@shared/Process'

export interface StaticHttpServe {
  server: Server
  port: number
  host: Array<string>
}
export interface PtyLast {
  command: string
  key: string
}

export interface PtyItem {
  killed?: boolean
  pty: IPty
  data: string
  task: {
    command: string
    key: string
    reportExitCode?: boolean
  }[]
  execFile?: string
  waitForExit?: boolean
  killTimer?: NodeJS.Timeout
  cancelChildren?: Promise<PItem[]>
}
