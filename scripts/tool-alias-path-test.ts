import assert from 'node:assert/strict'
import { parseExportPathEntries } from '../src/fork/module/Tool/pathExport'

assert.deepEqual(parseExportPathEntries('export PATH="/flyenv/alias:/flyenv/env/nginx:":$PATH"'), [
  '/flyenv/alias',
  '/flyenv/env/nginx'
])

assert.deepEqual(parseExportPathEntries('export PATH="/flyenv/alias:/flyenv/env/php:$PATH"'), [
  '/flyenv/alias',
  '/flyenv/env/php'
])

console.log('tool alias path tests passed')
