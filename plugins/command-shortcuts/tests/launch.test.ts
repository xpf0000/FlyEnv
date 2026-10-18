import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tmpdir } from 'node:os'
import { openTerminal } from '../fork/launch'

test(
  'macOS passes AppleScript directly to osascript without an outer shell',
  { skip: process.platform !== 'darwin' },
  async () => {
    let called = false
    await openTerminal(
      { path: tmpdir(), command: 'printf "%s" "a\\b $(echo test)"' },
      async (file, args, options) => {
        called = true
        assert.equal(file, '/usr/bin/osascript')
        assert.equal(args.length, 2)
        assert.equal(args[0], '-e')
        assert.equal(options?.shell, false)
      }
    )
    assert.equal(called, true)
  }
)

test(
  'launcher errors propagate and invalid directories never launch',
  { skip: process.platform !== 'darwin' },
  async () => {
    let calls = 0
    const launch = async () => {
      calls++
      throw new Error('osascript failed')
    }
    await assert.rejects(
      openTerminal({ path: tmpdir(), command: 'pwd' }, launch),
      /osascript failed/
    )
    assert.equal(calls, 1)
    await assert.rejects(openTerminal({ path: '/missing/flyenv/path', command: 'pwd' }, launch))
    assert.equal(calls, 1)
  }
)
