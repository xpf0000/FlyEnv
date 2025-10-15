import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import Base from './Base'
import PHP from './PHP'

const Apache = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  docRoot: '/',
  ports: [{ in: '80', out: '8080' }],
  environment: {
    TZ: currentTimeZone
  },
  check() {
    if (!Apache.wwwRoot) {
      return I18nT('host.placeholderRootPath') + I18nT('podman.require')
    }
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()
    const apache: any = {
      image: `${mirror}httpd:${Apache.version}`,
      ports: Apache.ports.map((p) => `${p.out}:${p.in}`),
      networks: ['flyenv-network']
    }
    const flyenvDir = join(dirname(base.dir), 'flyenv-docker-compose/apache')
    await fs.mkdirp(flyenvDir)
    await fs.mkdirp(join(flyenvDir, 'conf'))
    await fs.mkdirp(join(flyenvDir, 'logs'))
    const root = Apache.wwwRoot
    const volumes = [
      {
        type: 'bind',
        source: normalize(root),
        target: '/usr/local/apache2/htdocs',
        read_only: false
      },
      {
        type: 'bind',
        source: './flyenv-docker-compose/apache/conf/httpd.conf',
        target: '/usr/local/apache2/conf/httpd.conf',
        read_only: false
      }
    ]
    const tmpl = join(window.Server.Static!, 'tmpl/docker-apache.conf')
    await fs.copyFile(tmpl, join(flyenvDir, 'conf/httpd.conf'))
    if (PHP.enable) {
      volumes.push({
        type: 'bind',
        source: './flyenv-docker-compose/apache/conf/vhost.conf',
        target: '/usr/local/apache2/conf/extra/vhost.conf',
        read_only: true
      })

      let root = '/usr/local/apache2/htdocs'
      if (Apache.docRoot !== '/') {
        root = join(root, Apache.docRoot)
      }
      const phpPort = PHP.ports[0].in
      const content = `<VirtualHost *:80>
    ServerAdmin webmaster@example.com
    DocumentRoot "${root}"
    ServerName localhost

    # File Access Restrictions
    <Files ~ (\\.user.ini|\\.htaccess|\\.git|\\.svn|\\.project|LICENSE|README.md)$>
        Require all denied
    </Files>

    # PHP
    <FilesMatch \\.php$>
        SetHandler "proxy:fcgi://php:${phpPort}"
    </FilesMatch>

    # Directory
    <Directory "${root}">
        SetOutputFilter DEFLATE
        Options FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.php index.html index.htm default.php default.html default.htm
    </Directory>
</VirtualHost>
`
      await fs.writeFile(join(flyenvDir, 'conf/vhost.conf'), content)
    }
    const environment: any = {
      ...Apache.environment
    }
    apache.volumes = volumes
    apache.environment = environment
    return {
      apache
    }
  }
})

export default Apache
