export const WINDOWS_PHP_EXTENSIONS = [
  { name: 'php_redis.dll', type: 'extension' },
  { name: 'php_xdebug.dll', type: 'zend_extension' },
  { name: 'php_mongodb.dll', type: 'extension' },
  { name: 'php_memcache.dll', type: 'extension' },
  { name: 'php_pdo_sqlsrv.dll', type: 'extension' },
  { name: 'php_openssl.dll', type: 'extension' },
  { name: 'php_curl.dll', type: 'extension' },
  { name: 'php_gd.dll', type: 'extension' },
  { name: 'php_fileinfo.dll', type: 'extension' },
  { name: 'php_zip.dll', type: 'extension' },
  { name: 'php_mbstring.dll', type: 'extension' },
  { name: 'php_mysqli.dll', type: 'extension' },
  { name: 'php_pdo_mysql.dll', type: 'extension' },
  { name: 'php_pdo_odbc.dll', type: 'extension' },
  { name: 'php_intl.dll', type: 'extension' },
  { name: 'php_exif.dll', type: 'extension' },
  { name: 'php_simplexml.dll', type: 'extension' },
  { name: 'php_xml.dll', type: 'extension' },
  { name: 'php_dom.dll', type: 'extension' },
  { name: 'php_xmlreader.dll', type: 'extension' },
  { name: 'php_xmlwriter.dll', type: 'extension' },
  { name: 'php_json.dll', type: 'extension' },
  { name: 'php_bcmath.dll', type: 'extension' },
  { name: 'php_sodium.dll', type: 'extension' },
  { name: 'php_soap.dll', type: 'extension' },
  { name: 'php_ldap.dll', type: 'extension' },
  { name: 'php_imap.dll', type: 'extension' },
  { name: 'php_sockets.dll', type: 'extension' },
  { name: 'php_pdo_pgsql.dll', type: 'extension' },
  { name: 'php_pdo_sqlite.dll', type: 'extension' },
  { name: 'php_sqlite3.dll', type: 'extension' },
  { name: 'php_iconv.dll', type: 'extension' },
  { name: 'php_ftp.dll', type: 'extension' },
  { name: 'php_gettext.dll', type: 'extension' },
  { name: 'php_shmop.dll', type: 'extension' }
] as const

type ExtensionExists = (name: string) => boolean

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const buildWindowsPhpIni = (content: string, extensionExists: ExtensionExists): string => {
  const extensionDir = /^\s*;?\s*extension_dir\s*=\s*"ext"\s*$/m
  let result = extensionDir.test(content)
    ? content.replace(extensionDir, 'extension_dir = "ext"')
    : `${content.trimEnd()}\n\nextension_dir = "ext"\n`

  const enabled = WINDOWS_PHP_EXTENSIONS.filter(({ name }) => extensionExists(name)).filter(
    ({ name, type }) => {
      const line = new RegExp(`^\\s*${type}\\s*=\\s*${escapeRegExp(name)}\\s*$`, 'm')
      return !line.test(result)
    }
  )
  if (enabled.length > 0) {
    result = `${result.trimEnd()}\n\n${enabled.map(({ name, type }) => `${type}=${name}`).join('\n')}\n`
  }
  return `${result.trimEnd()}\n`
}
