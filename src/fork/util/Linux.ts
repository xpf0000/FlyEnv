import { execPromise } from '../Fn'

export async function isDEB() {
  try {
    await execPromise('command -v dpkg')
    return true
  } catch {
    return false
  }
}
