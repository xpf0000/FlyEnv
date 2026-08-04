import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  httpUrlFromAddress,
  normalizeListenAddress,
  parsePort,
  readConfigValue,
  unquoteConfigValue
} from '../src/shared/ServiceWebAddress'

assert.equal(unquoteConfigValue('"9015"'), '9015')
assert.equal(unquoteConfigValue("'9015'"), '9015')
assert.equal(unquoteConfigValue('  :9015  '), ':9015')
assert.equal(readConfigValue('MINIO_ADDRESS=:9000\nMINIO_CONSOLE_ADDRESS="9015"', 'MINIO_CONSOLE_ADDRESS'), '9015')
assert.equal(readConfigValue('MINIO_ADDRESS=:9000', 'MINIO_CONSOLE_ADDRESS'), '')
assert.equal(normalizeListenAddress('9015'), '127.0.0.1:9015')
assert.equal(normalizeListenAddress(':9015'), ':9015')
assert.equal(normalizeListenAddress('127.0.0.1:9015'), '127.0.0.1:9015')
assert.equal(normalizeListenAddress('bad', '127.0.0.1:9001'), '127.0.0.1:9001')
assert.equal(parsePort('"10999"', 10848), 10999)
assert.equal(parsePort('0', 10848), 10848)
assert.equal(parsePort('not-a-port', 10848), 10848)
assert.equal(httpUrlFromAddress(':9015', '127.0.0.1:9001', '/'), 'http://127.0.0.1:9015/')

const root = join(import.meta.dirname, '..')
const consulPage = readFileSync(join(root, 'src/render/components/Consul/Index.vue'), 'utf8')
assert.match(consulPage, /<template v-if="isRunning" #tool-left>/)
assert.match(consulPage, /openConsulUI/)
assert.match(consulPage, /ports\?\.http/)
assert.match(consulPage, /shell\.openExternal\(`http:\/\/127\.0\.0\.1:\$\{port\}\/ui\/`\)/)

const minioFork = readFileSync(join(root, 'src/fork/module/Minio/index.ts'), 'utf8')
const minioPage = readFileSync(join(root, 'src/render/components/Minio/Index.vue'), 'utf8')
assert.match(minioFork, /readConfigValue/)
assert.match(minioFork, /normalizeListenAddress\(console_address/)
assert.match(minioPage, /readConfigValue\(content, 'MINIO_CONSOLE_ADDRESS'\)/)
assert.match(minioPage, /httpUrlFromAddress/)
assert.doesNotMatch(minioPage, /find\(\(s: string\) => s\.includes\('MINIO_ADDRESS'\)\)/)

console.log('service web panel tests passed')
