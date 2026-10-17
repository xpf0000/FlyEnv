import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenizeExtraArgs,
  parseExtraArgs,
  mergeLaunchOptions,
  formatInvocation
} from '../fork/launchArguments'
import { parseRuntimeHelp } from '../fork/capabilities'
const caps = parseRuntimeHelp(
  '--model FILE  file\n--host HOST  host\n--mmproj FILE  projector\n-ctk, --cache-type-k TYPE  cache\n--chat-template-kwargs STRING  json\n--no-mmap  memory\n--alias STRING  alias'
)
test('preserves Windows paths and JSON as argv values without evaluating shell expressions', () => {
  const opts = parseExtraArgs(
    tokenizeExtraArgs(
      `--mmproj "C:\\Models\\My Model\\mmproj.gguf" --chat-template-kwargs '{"enabled":false}' --alias '--literal'`
    ),
    caps
  )
  assert.deepEqual(
    opts.map((x) => x.values),
    [['C:\\Models\\My Model\\mmproj.gguf'], ['{"enabled":false}'], ['--literal']]
  )
  assert.throws(() => tokenizeExtraArgs('--alias "unfinished'))
  assert.throws(() => tokenizeExtraArgs('--alias foo | cat'))
})
test('normalises alias collisions and rejects host overrides', () => {
  const options = parseExtraArgs(tokenizeExtraArgs('-ctk f16 --cache-type-k f16'), caps)
  assert.throws(() => mergeLaunchOptions([], options, caps), /duplicate/i)
  assert.throws(
    () => mergeLaunchOptions([], parseExtraArgs(tokenizeExtraArgs('--host 0.0.0.0'), caps), caps),
    /managed/i
  )
  assert.equal(
    mergeLaunchOptions([], parseExtraArgs(tokenizeExtraArgs('--no-mmap'), caps), caps)[0].negative,
    true
  )
})
test('display shell escaping is separate from actual argv', () => {
  assert.equal(
    formatInvocation({ bin: '/bin/server', args: ["a'b", '$HOME'], cwd: '/tmp' }, 'posix'),
    "cd '/tmp' && '/bin/server' 'a'\"'\"'b' '$HOME'"
  )
  assert.equal(
    formatInvocation({ bin: 'C:\\server.exe', args: ["a'b"], cwd: 'C:\\' }, 'win32'),
    "Set-Location -LiteralPath 'C:\\'; & 'C:\\server.exe' 'a''b'"
  )
})
