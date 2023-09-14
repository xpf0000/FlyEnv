const { join } = require('path')
const { execSync } = require('child_process')
/**
 * 处理appstore node-pty python链接库问题
 * @param pack
 * @returns {Promise<boolean>}
 */
exports.default = async function after(pack) {
  const dir = join(pack.appOutDir, 'PhpWebStudy.app/Contents/Resources')
  const optdefault = { env: process.env, cwd: dir }
  if (!optdefault.env['PATH']) {
    optdefault.env['PATH'] =
      '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  } else {
    optdefault.env[
      'PATH'
    ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:${optdefault.env['PATH']}`
  }
  execSync('asar e app.asar app', optdefault)
  execSync('rm -rf app/node_modules/node-pty/build/node_gyp_bins', optdefault)
  execSync('rm -rf app.asar', optdefault)
  execSync('asar pack app app.asar', optdefault)
  execSync('rm -rf app', optdefault)
  console.log('afterPack handle end !!!!!!')
  return true
}
