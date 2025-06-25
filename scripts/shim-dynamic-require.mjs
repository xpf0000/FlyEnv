import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// eslint-disable-next-line no-undef
if (global) {
  // eslint-disable-next-line no-undef
  global.require = require
}
