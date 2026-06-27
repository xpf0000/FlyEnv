import assert from 'node:assert/strict'
import {
  parseMySqlStyleConfigText,
  parsePostgresqlConfigText,
  parseRedisConfigText
} from '../src/main/core/MCPContextResolver'

function testParseMySqlStyleConfigText() {
  const parsed = parseMySqlStyleConfigText(`
[mysqld]
port=3307
datadir=/data/mysql84
socket=/tmp/mysql.sock
`)

  assert.equal(parsed.serverSection, 'mysqld')
  assert.equal(parsed.values.port, '3307')
  assert.equal(parsed.values.datadir, '/data/mysql84')
  assert.equal(parsed.values.socket, '/tmp/mysql.sock')
}

function testParseMariaDbStyleConfigText() {
  const parsed = parseMySqlStyleConfigText(`
[mariadbd]
port = 3310
datadir = "/data/mariadb"
`)

  assert.equal(parsed.serverSection, 'mariadbd')
  assert.equal(parsed.values.port, '3310')
  assert.equal(parsed.values.datadir, '/data/mariadb')
}

function testParsePostgresqlConfigText() {
  const parsed = parsePostgresqlConfigText(`
# comment
port = 5433
unix_socket_directories = '/tmp/postgresql'
`)

  assert.equal(parsed.port, '5433')
  assert.equal(parsed.unixSocketDirectories, '/tmp/postgresql')
}

function testParseRedisConfigText() {
  const parsed = parseRedisConfigText(`
bind 127.0.0.1
port 6381
dir /data/redis7
unixsocket /tmp/redis.sock
`)

  assert.equal(parsed.port, '6381')
  assert.equal(parsed.dir, '/data/redis7')
  assert.equal(parsed.unixsocket, '/tmp/redis.sock')
}

function main() {
  testParseMySqlStyleConfigText()
  testParseMariaDbStyleConfigText()
  testParsePostgresqlConfigText()
  testParseRedisConfigText()
  console.log('mcp context parser tests passed')
}

main()
