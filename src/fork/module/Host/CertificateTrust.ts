import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { X509Certificate } from 'node:crypto'

const systemKeychain = '/Library/Keychains/System.keychain'
const execute = promisify(execFile)
export type SecurityQuery = (args: string[]) => Promise<{ stdout: string }>
const querySecurity: SecurityQuery = (args) =>
  execute('/usr/bin/security', args, { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })

/** Presence and effective trust both refer to this exact CA in the system keychain. */
export async function macOSCertificateIsTrusted(
  caPath: string,
  certificate: X509Certificate,
  query: SecurityQuery = querySecurity
): Promise<boolean> {
  const fingerprint = certificate.fingerprint256
  let result: { stdout: string }
  try {
    result = await query(['find-certificate', '-a', '-p', '-Z', systemKeychain])
  } catch (error) {
    if ((error as { code?: unknown }).code === 44) return false
    throw error
  }
  const certificates =
    result.stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []
  const present = certificates.some((pem) => {
    try {
      return new X509Certificate(pem).fingerprint256 === fingerprint
    } catch {
      return false
    }
  })
  if (!present) return false
  try {
    // -r would declare an explicit trust anchor and bypass installed trust.
    await query(['verify-cert', '-c', caPath, '-p', 'basic', '-l', '-L', '-k', systemKeychain])
    return true
  } catch (error) {
    // security reports failed verification with a numeric exit status; transport failures propagate.
    if (typeof (error as NodeJS.ErrnoException).code === 'number') return false
    throw error
  }
}
