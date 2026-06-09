import { notarize, type NotarizeOptions } from '@electron/notarize'
import type { AfterPackContext } from 'app-builder-lib'

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
  await notarize(param)
  return
}
