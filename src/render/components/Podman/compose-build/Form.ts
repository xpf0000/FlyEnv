import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'

const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const ComposeBuildForm = reactive({
  base: {
    id: '',
    dir: '',
    name: '',
    flag: '',
    comment: '',
    check() {
      const info = ComposeBuildForm.base
      if (!info.name) {
        return I18nT('base.name') + I18nT('podman.require')
      }
      if (!info.dir) {
        return I18nT('podman.ComposeFileSaveDir') + I18nT('podman.require')
      }
      return ''
    }
  },
  PHP: {
    enable: false,
    version: 'latest',
    ports: [{ in: '9000', out: '9000' }],
    async build() {
      const info = ComposeBuildForm['PHP']
      const php: any = {
        image: `httpd:${info.version}`,
        ports: info.ports.map((p) => `${p.out}:${p.in}`)
      }
      const apache = ComposeBuildForm['Apache HTTP Server']
      if (apache.enable) {
        php.volumes = [
          {
            type: 'bind',
            source: normalize(apache.wwwRoot),
            target: '/var/www/html',
            read_only: false
          }
        ]
      }
      return {
        php
      }
    }
  },
  'Apache HTTP Server': {
    enable: false,
    version: 'latest',
    wwwRoot: '',
    docRoot: '/',
    ports: [{ in: '80', out: '8080' }],
    volumes: [{ in: '', out: '/usr/local/apache2/htdocs' }],
    environment: {
      TZ: currentTimeZone
    },
    check() {
      const info = ComposeBuildForm['Apache HTTP Server']
      if (!info.wwwRoot) {
        return I18nT('host.placeholderRootPath') + I18nT('podman.require')
      }
      return ''
    },
    async build() {
      const info = ComposeBuildForm['Apache HTTP Server']
      const apache: any = {
        image: `httpd:${info.version}`,
        ports: info.ports.map((p) => `${p.out}:${p.in}`)
      }
      const base = ComposeBuildForm.base
      const flyenvDir = join(dirname(base.dir), 'flyenv-docker-compose/apache')
      await fs.mkdirp(flyenvDir)
      await fs.mkdirp(join(flyenvDir, 'conf'))
      await fs.mkdirp(join(flyenvDir, 'logs'))
      let root = info.wwwRoot
      if (info.docRoot !== '/') {
        root = join(root, info.docRoot)
      }
      const volumes = [
        {
          type: 'bind',
          source: normalize(root),
          target: '/usr/local/apache2/htdocs',
          read_only: false
        }
      ]
      if (ComposeBuildForm.PHP.enable) {
        volumes.push({
          type: 'bind',
          source: './flyenv-docker-compose/apache/conf/vhost.conf',
          target: '/usr/local/apache2/conf/extra/vhost.conf',
          read_only: true
        })

        apache.command = `>
      sh -c "grep -q 'Include conf/extra/vhost.conf' /usr/local/apache2/conf/httpd.conf ||
      echo 'Include conf/extra/vhost.conf' >> /usr/local/apache2/conf/httpd.conf
      && httpd-foreground"`

        const phpPort = ComposeBuildForm.PHP.ports[0].in
        const content = `<VirtualHost *:80>
    ServerAdmin webmaster@example.com
    DocumentRoot "/usr/local/apache2/htdocs"
    ServerName localhost

    # File Access Restrictions
    <Files ~ (\\.user.ini|\\.htaccess|\\.git|\\.svn|\\.project|LICENSE|README.md)$>
        Require all denied
    </Files>

    # PHP
    <FilesMatch \\.php$>
        SetHandler "proxy:fcgi://127.0.0.1:${phpPort}"
    </FilesMatch>

    # Directory
    <Directory "/usr/local/apache2/htdocs">
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
        ...info.environment
      }
      apache.volumes = volumes
      apache.environment = environment
      return {
        apache
      }
    }
  }
})

export { ComposeBuildForm }
