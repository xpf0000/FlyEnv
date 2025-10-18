import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import Base from './Base'
import PHP from './PHP'

const Caddy = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  docRoot: '/',
  ports: [
    { in: '80', out: '8080' },
    { in: '443', out: '8443' }
  ],
  environment: {
    TZ: currentTimeZone,
    CADDY_DOMAIN: 'localhost'
  },
  check() {
    if (!Caddy.wwwRoot) {
      return I18nT('host.placeholderRootPath') + I18nT('podman.require')
    }
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()
    const caddy: any = {
      image: `${mirror}caddy:${Caddy.version}`,
      ports: Caddy.ports.map((p) => `${p.out}:${p.in}`),
      networks: ['flyenv-network']
    }

    const flyenvDir = join(dirname(base.dir), 'flyenv-docker-compose/caddy')
    await fs.mkdirp(flyenvDir)
    await fs.mkdirp(join(flyenvDir, 'config'))

    const root = Caddy.wwwRoot
    const volumes = [
      {
        type: 'bind',
        source: normalize(root),
        target: '/srv',
        read_only: false
      },
      {
        type: 'bind',
        source: './flyenv-docker-compose/caddy/config/Caddyfile',
        target: '/etc/caddy/Caddyfile',
        read_only: false
      }
    ]

    // 生成 Caddyfile
    let caddyfileContent = `${Caddy.environment.CADDY_DOMAIN} {\n`
    caddyfileContent += `    root * /srv`

    if (Caddy.docRoot !== '/') {
      caddyfileContent += `/${Caddy.docRoot}`
    }

    caddyfileContent += '\n'

    if (PHP.enable) {
      const phpPort = PHP.ports[0].in
      caddyfileContent += `    file_server\n`
      caddyfileContent += `    php_fastcgi php:${phpPort}\n`
      caddyfileContent += `    @forbidden {\n`
      caddyfileContent += `        path *.user.ini *.htaccess *.git *.svn *.project LICENSE README.md\n`
      caddyfileContent += `    }\n`
      caddyfileContent += `    respond @forbidden 403\n`
    } else {
      caddyfileContent += `    file_server\n`
    }

    caddyfileContent += `}\n`

    await fs.writeFile(join(flyenvDir, 'config/Caddyfile'), caddyfileContent)

    const environment: any = {
      ...Caddy.environment
    }

    caddy.volumes = volumes
    caddy.environment = environment
    return {
      caddy
    }
  }
})

export default Caddy
