const { execSync } = require('child_process')
function fixEnv() {
  const env = { ...process.env }
  if (!env['PATH']) {
    env['PATH'] =
      '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  } else {
    env[
      'PATH'
    ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/usr/sbin:${env['PATH']}`
  }
  return env
}

function doSend(num) {
  process.send(num)
}

const names = [
  'php',
  'nginx',
  'pure-ftpd',
  'apache',
  'memcached',
  'mysql',
  'mariadb',
  'redis',
  'mongodb',
  'postgresql'
]

function brewinfo(num) {
  const name = names[num]
  const Info = {}
  const findAll = () => {
    const all = []
    let cammand = ''
    switch (name) {
      case 'php':
        all.push('php')
        cammand = 'brew search --formula "/php@[\\d\\.]+$/"'
        break
      case 'nginx':
        all.push('nginx')
        break
      case 'pure-ftpd':
        all.push('pure-ftpd')
        break
      case 'apache':
        all.push('httpd')
        break
      case 'memcached':
        all.push('memcached')
        break
      case 'mysql':
        all.push('mysql')
        cammand = 'brew search --formula "/mysql@[\\d\\.]+$/"'
        break
      case 'mariadb':
        all.push('mariadb')
        cammand = 'brew search --formula "/mariadb@[\\d\\.]+$/"'
        break
      case 'redis':
        all.push('redis')
        cammand = 'brew search --formula "/^redis@[\\d\\.]+$/"'
        break
      case 'mongodb':
        cammand =
          'brew search --desc --eval-all --formula "High-performance, schema-free, document-oriented database"'
        break
      case 'postgresql':
        cammand = 'brew search --formula "/^postgresql@[\\d\\.]+$/"'
        break
    }
    if (cammand) {
      const env = fixEnv()
      env.HOMEBREW_NO_INSTALL_FROM_API = 1
      console.log('cammand0: ', cammand)
      let content = execSync(cammand, {
        env
      }).toString()
      if (name === 'mongodb') {
        content = content
          .replace('==> Formulae', '')
          .replace(
            new RegExp(
              ': High-performance, schema-free, document-oriented database \\(Enterprise\\)',
              'g'
            ),
            ''
          )
          .replace(
            new RegExp(': High-performance, schema-free, document-oriented database', 'g'),
            ''
          )
      }
      content = content
        .split('\n')
        .filter((s) => !!s.trim())
        .map((s) => s.trim())
      all.push(...content)
    }
    return all
  }
  const doRun = () => {
    const env = fixEnv()
    env.HOMEBREW_NO_INSTALL_FROM_API = 1
    const all = findAll()
    const cammand = ['brew', 'info', ...all, '--json', '--formula'].join(' ')
    console.log('cammand1: ', cammand)
    const stdout = execSync(cammand, {
      env
    }).toString()
    const arr = JSON.parse(stdout.toString().trim())
    arr.forEach((item) => {
      Info[item.full_name] = {
        version: item?.versions?.stable ?? '',
        installed: item?.installed?.length > 0,
        name: item.full_name,
        flag: 'brew'
      }
    })
    // console.log('Info: ', Info)
    doSend(num)
  }
  doRun()
}

process.on('message', (num) => {
  console.log('sub message: ', num)
  brewinfo(num)
})
