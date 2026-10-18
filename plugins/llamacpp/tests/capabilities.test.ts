import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRuntimeHelp } from '../fork/capabilities'
test('extracts aliases and arity while keeping unknown syntax unverified', () => {
  const caps = parseRuntimeHelp(
    '-m, --model FNAME  model file\n-mm, --mmproj FILE  projector\n-fa, --flash-attn [on|off|auto]  attention\n--no-mmap  disable mapping'
  )
  assert.equal(caps.byAlias['-mm'].canonicalName, 'mmproj')
  assert.equal(caps.byAlias['--model'].arity, 1)
  assert.deepEqual(caps.byAlias['--flash-attn'].values, ['on', 'off', 'auto'])
  assert.equal(caps.byAlias['--no-mmap'].arity, 0)
  assert.equal(parseRuntimeHelp('no usable usage').status, 'unknown')
})
test('reads wrapped runtime value lists, negative aliases and old two-value options', () => {
  const c = parseRuntimeHelp(
    '--model FNAME  model\n--cache-type-k TYPE  KV\n    allowed values: f32, f16, q8_0,\n    q4_0, q5_0\n--load-mode MODE  loading\n    - auto: automatic\n    - mmap+mlock: locked mapping\n--mmproj-auto, --no-mmproj, --no-mmproj-auto  auto\n--lora-scaled FNAME SCALE  adapter'
  )
  assert.deepEqual(c.byAlias['--cache-type-k'].values, ['f32', 'f16', 'q8_0', 'q4_0', 'q5_0'])
  assert.deepEqual(c.byAlias['--load-mode'].values, ['auto', 'mmap+mlock'])
  assert.equal(c.byAlias['--no-mmproj'].negative, true)
  assert.equal(c.byAlias['--lora-scaled'].arity, 2)
})
test('real b10545 wrapped descriptions cannot overwrite a declared option', async () => {
  const { readFile } = await import('node:fs/promises')
  const help = await readFile(
    new URL('./fixtures/b10545-threads-help.txt', import.meta.url),
    'utf8'
  )
  for (const indent of ['', '  ']) {
    const caps = parseRuntimeHelp(
      help
        .split('\n')
        .map((line) => indent + line)
        .join('\n')
    )
    assert.equal(caps.byAlias['--threads'].arity, 1)
    assert.deepEqual(caps.byAlias['--threads'].aliases, ['-t', '--threads'])
    assert.equal(caps.byAlias['--spec-draft-threads'].arity, 1)
  }
})
