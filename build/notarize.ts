import { notarize } from '@electron/notarize'

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const jwt = {
    appleApiIssuer: process.env.APPLE_API_ISSUER,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiKey: process.env.APPLE_API_KEY_PATH,
  }

  const appName = context.packager.appInfo.productFilename
  let param = {
    tool: 'notarytool',
    appPath: `${appOutDir}/${appName}.app`
  }
  param = { ...param, ...jwt }
  await notarize(param)
  return
}
