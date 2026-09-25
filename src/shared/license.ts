import { publicDecrypt } from 'crypto'
import { machineId } from './machineId'

export function getLicensePublicKey() {
  const a = '0+u/eiBrB/DAskp9HnoIgq1MDwwbQRv6rNxiBK/qYvvdXJHKBmAtbe0+SW8clzne'
  const b = 'Kq1BrqQFebPxLEMzQ19yrUyei1nByQwzlX8r3DHbFqE6kV9IcwNh9yeW3umUw05F'
  const c = 'zwIDAQAB'
  const d = 'n7Yl8hRd195GT9h48GsW+ekLj2ZyL/O4rmYRlrNDtEAcDNkI0UG0NlG+Bbn2yN1t'
  const e = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzVJ3axtKGl3lPaUFN82B'
  const f = 'XZW4pCiCvUTSMIU86DkBT/CmDw5n2fCY/FKMQue+WNkQn0mrRphtLH2x0NzIhg+l'
  const g = 'Zkm1wi9pNWLJ8ZvugKZnHq+l9ZmOES/xglWjiv3C7/i0nUtp0sTVNaVYWRapFsTL'
  const arr: string[] = [e, g, b, a, f, d, c]

  const a1 = '-----'
  const a2 = ' PUBLIC KEY'
  const a3 = 'BEGIN'
  const a4 = 'END'

  arr.unshift([a1, a3, a2, a1].join(''))
  arr.push([a1, a4, a2, a1].join(''))

  return arr.join('\n')
}

export function decryptLicenseUUID(code: string): string | undefined {
  try {
    return publicDecrypt(getLicensePublicKey(), Buffer.from(code, 'base64') as any).toString(
      'utf-8'
    )
  } catch {
    return undefined
  }
}

/**
 * Local license validation: the activation code RSA-encrypts the machine id.
 * The code itself is fetched/validated server-side by the fork process; this
 * check only proves the stored code belongs to this machine.
 */
export async function verifyLicenseCode(code?: string): Promise<boolean> {
  if (!code) return false
  const uid = decryptLicenseUUID(code)
  if (!uid) return false
  try {
    return uid === (await machineId())
  } catch {
    return false
  }
}
