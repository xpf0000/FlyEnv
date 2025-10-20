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
  ports: [{ in: '80', out: '8080' }],
  environment: {
    TZ: currentTimeZone
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
    let caddyfileContent = `http://localhost:80 {\n`
    caddyfileContent += `    root * /srv`

    if (Caddy.docRoot !== '/') {
      caddyfileContent += `/${Caddy.docRoot}`
    }

    caddyfileContent += '\n'

    if (PHP.enable) {
      const phpPort = PHP.ports[0].in
      caddyfileContent += `    file_server
    route {
        try_files {path} {path}/ /index.php?{query}
        php_fastcgi php:${phpPort}
    }
    @forbidden {
        path *.user.ini *.htaccess *.git *.svn *.project LICENSE README.md
    }
    respond @forbidden 403
}`
    } else {
      caddyfileContent += `    file_server\n}\n`
    }

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
