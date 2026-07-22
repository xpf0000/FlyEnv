import { isGvmVersionIdentifier, quotePosixShell } from '@shared/Gvm'

export type GvmVersionAction = 'install' | 'uninstall' | 'default'

export const GVM_INSTALL_COMMAND =
  'bash < <(curl -sSL https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)'

export function buildGvmVersionCommand(
  initScript: string,
  action: GvmVersionAction,
  version: string
): string {
  if (!isGvmVersionIdentifier(version)) {
    throw new Error(`Invalid GVM version: ${version}`)
  }
  const init = `source ${quotePosixShell(initScript)}`
  if (action === 'install') {
    return `${init} && gvm install ${version} -B`
  }
  if (action === 'uninstall') {
    return `${init} && gvm uninstall ${version}`
  }
  return `${init} && gvm use ${version} --default`
}
