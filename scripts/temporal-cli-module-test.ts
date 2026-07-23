import assert from 'node:assert/strict'
import { buildDefaultConf, parseConfToArgs } from '../src/fork/module/TemporalCli/util'

// 默认 conf 全量解析
const conf = buildDefaultConf('E:/FlyEnv-Data/server/temporal-cli/data/dev.db')
const args = parseConfToArgs(conf)
assert.deepEqual(args, [
  '--ip=127.0.0.1',
  '--port=7233',
  '--http-port=7243',
  '--ui-ip=127.0.0.1',
  '--ui-port=8233',
  '--db-filename=E:/FlyEnv-Data/server/temporal-cli/data/dev.db',
  '--log-level=info',
  '--log-format=text',
  '--headless=false'
])

// 注释、空行、无等号行、空 key、空 value 全部跳过
assert.deepEqual(parseConfToArgs('# comment\n\nport=7300\nbroken-line\n=noval\nkey=\n  \n'), [
  '--port=7300'
])

// key/value 去空格；value 含等号时按第一个等号切分
assert.deepEqual(parseConfToArgs('  port = 7301 \ndynamic-config-value=K={"a":1}\n'), [
  '--port=7301',
  '--dynamic-config-value=K={"a":1}'
])

console.log('ALL CHECKS PASSED')
