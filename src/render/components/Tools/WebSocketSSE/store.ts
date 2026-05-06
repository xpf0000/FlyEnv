import { reactive } from 'vue'
import IPC from '@/util/IPC'

type Protocol = 'websocket' | 'sse'
type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error'
type MessageMode = 'text' | 'json'
type LogType = 'info' | 'sent' | 'received' | 'event' | 'error' | 'closed' | 'heartbeat'

type KeyValueRow = {
  id: number
  key: string
  value: string
  enabled: boolean
}

type LogItem = {
  id: number
  time: string
  type: LogType
  label: string
  content: string
  size: number
}

let socket: WebSocket | null = null
let sseConnectionKey = ''
let sseBuffer = ''
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let connectedAt = 0
let idSeed = Date.now()

const newId = () => {
  idSeed += 1
  return idSeed
}

const defaultWebSocketUrl = 'ws://localhost:3000/ws'
const defaultSseUrl = 'http://localhost:3000/events'
const defaultJsonMessage = JSON.stringify({ type: 'ping' }, null, 2)

const formatDate = (date = new Date()) => date.toLocaleTimeString()

const getByteSize = (value: string) => new Blob([value]).size

const formatMaybeJson = (value: string) => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

const compactJson = (value: string) => JSON.stringify(JSON.parse(value))

const buildUrl = (rawUrl: string, params: KeyValueRow[]) => {
  const url = new URL(rawUrl.trim())
  params
    .filter((item) => item.enabled && item.key)
    .forEach((item) => {
      url.searchParams.set(item.key, item.value)
    })
  return url.toString()
}

const getEnabledHeaders = (headers: KeyValueRow[]) => {
  const result: Record<string, string> = {}
  headers
    .filter((item) => item.enabled && item.key)
    .forEach((item) => {
      result[item.key] = item.value
    })
  return result
}

const parseProtocols = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const parseSseEvent = (raw: string) => {
  const event = {
    event: 'message',
    id: '',
    retry: '',
    data: [] as string[]
  }
  raw.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith(':')) {
      return
    }
    const colonIndex = line.indexOf(':')
    const field = colonIndex >= 0 ? line.slice(0, colonIndex) : line
    const value = colonIndex >= 0 ? line.slice(colonIndex + 1).replace(/^ /, '') : ''
    if (field === 'event') {
      event.event = value || 'message'
    } else if (field === 'data') {
      event.data.push(value)
    } else if (field === 'id') {
      event.id = value
    } else if (field === 'retry') {
      event.retry = value
    }
  })
  return event
}

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

const store = reactive({
  protocol: 'websocket' as Protocol,
  status: 'Disconnected' as ConnectionStatus,
  url: defaultWebSocketUrl,
  protocols: '',
  params: [] as KeyValueRow[],
  headers: [] as KeyValueRow[],
  bearerToken: '',
  messageMode: 'json' as MessageMode,
  message: defaultJsonMessage,
  heartbeatEnabled: false,
  heartbeatInterval: 30,
  heartbeatMessage: defaultJsonMessage,
  sseEventFilter: '',
  sseLastEventId: '',
  logs: [] as LogItem[],
  error: '',
  get isConnected() {
    return this.status === 'Connected'
  },
  get canSend() {
    return this.protocol === 'websocket' && this.status === 'Connected'
  },
  get connectedDuration() {
    if (!connectedAt || this.status !== 'Connected') {
      return '0s'
    }
    return `${Math.floor((Date.now() - connectedAt) / 1000)}s`
  },
  addLog(type: LogType, label: string, content = '') {
    this.logs.unshift({
      id: newId(),
      time: formatDate(),
      type,
      label,
      content: formatMaybeJson(content),
      size: getByteSize(content)
    })
    if (this.logs.length > 300) {
      this.logs.splice(300)
    }
  },
  clearLogs() {
    this.logs.splice(0)
  },
  addParam() {
    this.params.push({ id: newId(), key: '', value: '', enabled: true })
  },
  removeParam(id: number) {
    const index = this.params.findIndex((item) => item.id === id)
    if (index >= 0) {
      this.params.splice(index, 1)
    }
  },
  addHeader() {
    this.headers.push({ id: newId(), key: '', value: '', enabled: true })
  },
  addAuthHeader() {
    if (!this.bearerToken.trim()) {
      return
    }
    const authorization = this.headers.find((item) => item.key.toLowerCase() === 'authorization')
    if (authorization) {
      authorization.value = `Bearer ${this.bearerToken.trim()}`
      authorization.enabled = true
    } else {
      this.headers.push({
        id: newId(),
        key: 'Authorization',
        value: `Bearer ${this.bearerToken.trim()}`,
        enabled: true
      })
    }
  },
  removeHeader(id: number) {
    const index = this.headers.findIndex((item) => item.id === id)
    if (index >= 0) {
      this.headers.splice(index, 1)
    }
  },
  onProtocolChange() {
    this.disconnect()
    this.url = this.protocol === 'websocket' ? defaultWebSocketUrl : defaultSseUrl
    this.error = ''
  },
  connect() {
    this.error = ''
    this.disconnect(false)
    try {
      const finalUrl = buildUrl(this.url, this.params)
      if (this.protocol === 'websocket') {
        this.connectWebSocket(finalUrl)
      } else {
        this.connectSse(finalUrl)
      }
    } catch (error: any) {
      this.status = 'Error'
      this.error = error?.message ?? 'Invalid URL'
      this.addLog('error', 'Invalid URL', this.error)
    }
  },
  connectWebSocket(finalUrl: string) {
    if (!/^wss?:\/\//i.test(finalUrl)) {
      throw new Error('WebSocket URL must start with ws:// or wss://')
    }
    this.status = 'Connecting'
    this.addLog('info', 'Connecting', finalUrl)
    socket = new WebSocket(finalUrl, parseProtocols(this.protocols))
    socket.onopen = () => {
      this.status = 'Connected'
      connectedAt = Date.now()
      this.addLog('info', 'Connected', finalUrl)
      this.startHeartbeat()
    }
    socket.onmessage = (event) => {
      this.addLog('received', 'Received', String(event.data))
    }
    socket.onerror = () => {
      this.status = 'Error'
      this.error = 'WebSocket connection error'
      this.addLog('error', 'WebSocket error', this.error)
    }
    socket.onclose = (event) => {
      stopHeartbeat()
      this.status = 'Disconnected'
      this.addLog('closed', `Closed (${event.code})`, event.reason)
    }
  },
  connectSse(finalUrl: string) {
    if (!/^https?:\/\//i.test(finalUrl)) {
      throw new Error('SSE URL must start with http:// or https://')
    }
    this.status = 'Connecting'
    this.addLog('info', 'Connecting', finalUrl)
    sseBuffer = ''
    const currentConnectionKey = `sse-${newId()}`
    sseConnectionKey = currentConnectionKey
    const headers = getEnabledHeaders(this.headers)
    if (this.sseLastEventId.trim()) {
      headers['Last-Event-ID'] = this.sseLastEventId.trim()
    }
    IPC.send('App-Node-FN', 'realtime', 'sseConnect', {
      url: finalUrl,
      headers,
      connectionKey: currentConnectionKey
    }).then((key: string, res: any) => {
      if (sseConnectionKey !== currentConnectionKey && res?.code !== 0) {
        return
      }
      if (res?.code === 100) {
        this.status = 'Connected'
        connectedAt = Date.now()
        this.addLog(
          'info',
          `Connected (${res.status})`,
          res.contentType ? `Content-Type: ${res.contentType}` : finalUrl
        )
      } else if (res?.code === 200) {
        this.handleSseChunk(res.data ?? '')
      } else if (res?.code === 0) {
        IPC.off(key)
        if (sseConnectionKey === currentConnectionKey) {
          sseConnectionKey = ''
          if (this.status !== 'Disconnected') {
            this.status = 'Disconnected'
            this.addLog('closed', 'SSE stream closed')
          }
        }
      } else if (res?.code === 500) {
        IPC.off(key)
        sseConnectionKey = ''
        this.status = 'Error'
        this.error = res.error ?? 'SSE connection error'
        this.addLog('error', 'SSE error', this.error)
      }
    })
  },
  disconnect(addLog = true) {
    stopHeartbeat()
    if (socket) {
      socket.close()
      socket = null
    }
    if (sseConnectionKey) {
      IPC.send('App-Node-FN', 'realtime', 'sseStop', sseConnectionKey).then((key: string) => {
        IPC.off(key)
      })
      sseConnectionKey = ''
      sseBuffer = ''
    }
    connectedAt = 0
    if (this.status !== 'Disconnected') {
      this.status = 'Disconnected'
      if (addLog) {
        this.addLog('closed', 'Disconnected')
      }
    }
  },
  handleSseChunk(chunk: string) {
    sseBuffer += chunk
    const chunks = sseBuffer.split(/\r?\n\r?\n/)
    sseBuffer = chunks.pop() ?? ''
    chunks.forEach((item) => {
      const event = parseSseEvent(item)
      if (this.sseEventFilter && event.event !== this.sseEventFilter) {
        return
      }
      const meta = [`event: ${event.event}`]
      if (event.id) {
        meta.push(`id: ${event.id}`)
      }
      if (event.retry) {
        meta.push(`retry: ${event.retry}`)
      }
      this.addLog('event', meta.join(', '), event.data.join('\n'))
    })
  },
  getMessageContent(value?: string, mode?: MessageMode) {
    const messageValue = value ?? this.message
    const messageMode = mode ?? this.messageMode
    if (messageMode === 'json') {
      return compactJson(messageValue)
    }
    return messageValue
  },
  sendMessage(value?: string, mode?: MessageMode, logType: LogType = 'sent') {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.error = 'WebSocket is not connected'
      this.addLog('error', 'Send failed', this.error)
      return
    }
    try {
      const content = this.getMessageContent(value, mode)
      socket.send(content)
      this.addLog(logType, logType === 'heartbeat' ? 'Heartbeat' : 'Sent', content)
    } catch (error: any) {
      this.error = error?.message ?? 'Invalid message'
      this.addLog('error', 'Send failed', this.error)
    }
  },
  formatMessage() {
    try {
      this.message = JSON.stringify(JSON.parse(this.message), null, 2)
      this.messageMode = 'json'
    } catch (error: any) {
      this.error = error?.message ?? 'Invalid JSON'
      this.addLog('error', 'JSON format failed', this.error)
    }
  },
  startHeartbeat() {
    stopHeartbeat()
    if (!this.heartbeatEnabled || this.protocol !== 'websocket') {
      return
    }
    heartbeatTimer = setInterval(() => {
      this.sendMessage(this.heartbeatMessage, 'json', 'heartbeat')
    }, this.heartbeatInterval * 1000)
  }
})

export default store
