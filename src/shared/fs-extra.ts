import _fs from 'fs-extra'
import { createWriteStream, watch, existsSync, unlinkSync } from 'node:fs'
import {
  stat,
  chmod,
  copyFile,
  unlink,
  readdir,
  writeFile,
  realpath,
  readFile,
  appendFile,
  rename
} from 'node:fs/promises'

const { removeSync, mkdirp, remove, copy } = _fs

export {
  createWriteStream,
  stat,
  watch,
  chmod,
  copyFile,
  unlink,
  readdir,
  writeFile,
  realpath,
  readFile,
  existsSync,
  appendFile,
  rename,
  unlinkSync,
  removeSync,
  mkdirp,
  remove,
  copy
}
