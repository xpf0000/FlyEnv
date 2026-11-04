import { notarize, type NotarizeOptions } from '@electron/notarize'
import type { AfterPackContext } from 'app-builder-lib'
import { execFile } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function isCloudKitNetworkError(output: string) {
  return (
    output.includes('api.apple-cloudkit.com') &&
    /NSURLErrorDomain Code=-(?:1001|1005)\b/.test(output)
  )
}

export default async function notarizing(context: AfterPackContext) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const appleApiIssuer = process.env.APPLE_API_ISSUER
  const appleApiKeyId = process.env.APPLE_API_KEY_ID
  const appleApiKey = process.env.APPLE_API_KEY_PATH

  if (!appleApiIssuer || !appleApiKeyId || !appleApiKey) {
    console.warn(
      'Skipping notarization: APPLE_API_ISSUER, APPLE_API_KEY_ID and APPLE_API_KEY_PATH are required.'
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  const param: NotarizeOptions = {
    appPath: `${appOutDir}/${appName}.app`,
    appleApiIssuer,
    appleApiKeyId,
    appleApiKey
  }
  try {
    await notarize(param)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/^Failed to staple your application with code: 68\b/.test(error.message) ||
      !isCloudKitNetworkError(error.message)
    ) {
      throw error
    }

    // Notarization has already succeeded. Retry only ticket delivery; stapling remains
    // required for packaging, so exhausting recovery must still fail the build.
    const delays = [15_000, 30_000, 60_000]
    for (const [index, delay] of delays.entries()) {
      console.warn(
        `Notarization accepted, but CloudKit ticket delivery failed. Retrying stapling ${index + 1}/${delays.length} in ${delay / 1000}s.`
      )
      await setTimeout(delay)
      try {
        await execFileAsync('xcrun', ['stapler', 'staple', '-v', param.appPath], {
          timeout: 120_000
        })
        return
      } catch (retryError) {
        const failure = retryError as Error & { code?: number; stdout?: string; stderr?: string }
        const output = `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`
        if (index === delays.length - 1 || failure.code !== 68 || !isCloudKitNetworkError(output)) {
          throw retryError
        }
      }
    }
  }
  return
}
