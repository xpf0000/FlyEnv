import { isGvmVersionIdentifier, quotePosixShell } from '@shared/Gvm'

export type GvmVersionAction = 'install' | 'uninstall' | 'default'

export const GVM_INSTALL_COMMAND =
  'bash < <(curl -sSL https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)'

const GVM_SANITIZE_INVALID_DEFAULT =
  'if [ -n "$GOROOT" ] && [ ! -d "$GOROOT" ]; then rm -f "$GVM_ROOT/environments/default"; unset GOROOT GOPATH GOBIN gvm_go_name gvm_pkgset_name; fi'

export function buildGvmVersionCommand(
  initScript: string,
  action: GvmVersionAction,
  version: string,
  isDefault = false
): string {
  if (!isGvmVersionIdentifier(version)) {
    throw new Error(`Invalid GVM version: ${version}`)
  }
  const init = `source ${quotePosixShell(initScript)} && ${GVM_SANITIZE_INVALID_DEFAULT}`
  if (action === 'install') {
    return `${init} && gvm install ${version} -B`
  }
  if (action === 'uninstall') {
    const uninstall = `${init} && gvm uninstall ${version}`
    return isDefault
      ? `${uninstall} && rm -f "$GVM_ROOT/environments/default"`
      : uninstall
  }
  return `${init} && gvm use ${version} --default`
}
