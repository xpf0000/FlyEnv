import { join, resolve, dirname } from 'node:path'
import _fs from 'fs-extra'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { isLinux, isWindows } from "../src/shared/utils";
import type { PackContext } from 'app-builder-lib'


const { mkdirp, copyFile } = _fs
const execPromise = promisify(exec)

const archs = [
  'ia32',
  'x64',
  'armv7l',
  'arm64',
  'universal'
]
/**
 * Handle the app store node-pty Python library linking issue
 * @param {Object} pack - Pack object containing build information
 * @returns {Promise<boolean>}
 */
export default async function beforPack(pack: PackContext) {
  console.log('BeforPack pack: ', pack)
  return
}
