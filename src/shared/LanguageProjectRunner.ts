export type RunProjectItem = {
  id: string
  path: string
  comment: string
  binVersion: string
  binPath: string
  binBin: string
  isSorting?: boolean
  runCommand: string
  runFile: string
  commandType: 'command' | 'file'
  projectPort: number
  domain: string
  useSSL: boolean
  autoSSL: boolean
  ssl: {
    cert: string
    key: string
  }
  configPath: Array<{ name: string; path: string }>
  logPath: Array<{ name: string; path: string }>
  pidPath: string
  reverseProxy: Array<{ path: string; url: string }>
  isSudo: boolean
  envVarType: 'none' | 'specify' | 'file'
  envVar: string
  envFile: string
  runInTerminal: boolean
}

export type RunningState = {
  running: boolean
  isRun: boolean
  pid: string
}
