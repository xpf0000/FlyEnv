import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseGatewayStatus } from '../src/fork/module/OpenClaw/status'

const root = join(import.meta.dirname, '..')

assert.deepEqual(
  parseGatewayStatus(
    'Service: Scheduled Task (registered)\nRPC probe: ok\nDashboard: http://127.0.0.1:18789/'
  ),
  {
    isInstalled: true,
    isRunning: true,
    isStopped: false,
    dashboard: 'http://127.0.0.1:18789/'
  }
)

assert.deepEqual(
  parseGatewayStatus(
    [
      'OpenClaw 2026.7.1-2 (0790d9f)',
      '',
      'Service: Scheduled Task (registered)',
      'File logs: D:\\Temp\\User\\Temp\\openclaw\\openclaw-2026-08-21.log',
      'Command: D:\\Program Files\\PhpWebStudy-Data\\env\\node\\node.exe D:\\Program Files\\PhpWebStudy-Data\\app\\nodejs\\v25.9.0\\node_modules\\openclaw\\dist\\index.js gateway --port 18789',
      'Service file: ~\\.openclaw\\gateway.cmd',
      'Service env: OPENCLAW_GATEWAY_PORT=18789',
      '',
      'Config (cli): ~\\.openclaw\\openclaw.json',
      'Config (service): ~\\.openclaw\\openclaw.json',
      '',
      'Gateway: bind=loopback (127.0.0.1), port=18789 (service args)',
      'Probe target: ws://127.0.0.1:18789',
      'Dashboard: http://127.0.0.1:18789/',
      'Probe note: Loopback-only gateway; only local clients can connect.',
      '',
      'CLI version: 2026.7.1-2 (D:\\Program Files\\PhpWebStudy-Data\\env\\node\\node_modules\\openclaw\\openclaw.mjs)',
      'Gateway version: 2026.7.1-2',
      '',
      'Runtime: running (last run 267009, last run time 8/21/2026 3:26:09 PM)',
      'Connectivity probe: ok',
      'Capability: connected-no-operator-scope',
      '',
      'Listening: 127.0.0.1:18789',
      'Troubles: run openclaw status',
      'Troubleshooting: https://docs.openclaw.ai/troubleshooting'
    ].join('\n')
  ),
  {
    isInstalled: true,
    isRunning: true,
    isStopped: false,
    dashboard: 'http://127.0.0.1:18789/'
  }
)

assert.equal(parseGatewayStatus('RPC probe: failed').isStopped, true)
assert.equal(parseGatewayStatus('Connectivity probe: failed').isStopped, true)

const service = readFileSync(
  join(root, 'src', 'render', 'components', 'OpenClaw', 'Service.vue'),
  'utf-8'
)
const setup = readFileSync(
  join(root, 'src', 'render', 'components', 'OpenClaw', 'setup.ts'),
  'utf-8'
)
const commandData = readFileSync(
  join(root, 'src', 'render', 'components', 'OpenClaw', 'command.json'),
  'utf-8'
)

assert.match(service, /OpenClawSetup\.updateOpenClaw\(xtermDom\)/)
assert.match(setup, /async updateOpenClaw\(domRef: Ref<HTMLElement>\)/)
assert.match(commandData, /"label": "openclaw update"[^\n]*"needRefresh": true/)

console.log('openclaw service tests passed')
