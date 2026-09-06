import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/fork/module/RabbitMQ/index.ts', 'utf8')
const logsSource = readFileSync('src/render/components/RabbitMQ/Logs.vue', 'utf8')

assert.match(
  source,
  /execArgs:\s*\[\]/,
  'Unix RabbitMQ must stay attached so Erlang startup errors reach the captured logs'
)
assert.match(
  source,
  /start-error\.log/,
  'RabbitMQ must expose the startup stderr log when boot fails'
)
assert.match(
  source,
  /start-out\.log/,
  'RabbitMQ must expose the startup stdout log when boot fails'
)
assert.match(
  source,
  /startupDiagnostics[\s\S]{0,500}readFile\(file\.path/,
  'RabbitMQ startup failures must include captured process output'
)
assert.match(logsSource, /start-error\.log/, 'RabbitMQ logs page must show startup stderr')
assert.match(logsSource, /start-out\.log/, 'RabbitMQ logs page must show startup stdout')

console.log('rabbitmq startup diagnostics tests passed')
