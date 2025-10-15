import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import Base from './Base'
import PHP from './PHP'

const Nginx = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  docRoot: '/',
  ports: [{ in: '80', out: '8080' }],
  environment: {
    TZ: currentTimeZone
  },
  check() {
    if (!Nginx.wwwRoot) {
      return I18nT('host.placeholderRootPath') + I18nT('podman.require')
    }
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()
    const nginx: any = {
      image: `${mirror}nginx:${Nginx.version}`,
      ports: Nginx.ports.map((p) => `${p.out}:${p.in}`),
      networks: ['flyenv-network']
    }
    const flyenvDir = join(dirname(base.dir), 'flyenv-docker-compose/nginx')
    await fs.mkdirp(flyenvDir)
    await fs.mkdirp(join(flyenvDir, 'conf'))
    await fs.mkdirp(join(flyenvDir, 'logs'))

    const root = Nginx.wwwRoot
    const volumes = [
      {
        type: 'bind',
        source: normalize(root),
        target: '/usr/share/nginx/html',
        read_only: false
      }
    ]

    // 复制默认配置文件
    const tmpl = join(window.Server.Static!, 'tmpl/docker-nginx.conf')
    await fs.copyFile(tmpl, join(flyenvDir, 'conf/nginx.conf'))

    if (PHP.enable) {
      volumes.push({
        type: 'bind',
        source: './flyenv-docker-compose/nginx/conf/vhost.conf',
        target: '/etc/nginx/conf.d/default.conf',
        read_only: true
      })
      await fs.mkdirp(join(flyenvDir, 'conf'))

      let rootPath = '/usr/share/nginx/html'
      if (Nginx.docRoot !== '/') {
        rootPath = join(rootPath, Nginx.docRoot)
      }
      const phpPort = PHP.ports[0].in

      const content = `server {
    listen 80;
    server_name localhost;

    root ${rootPath};
    index index.php index.html index.htm;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        fastcgi_pass   php:${phpPort};
        fastcgi_index  index.php;
        include fastcgi_params;
        fastcgi_split_path_info ^(.+?\\.php)(/.*)$;
        fastcgi_param  SCRIPT_FILENAME  $document_root$fastcgi_script_name;
        fastcgi_param  PATH_INFO        $fastcgi_path_info;
    }

    location ~ /\\.(?!well-known).* {
        deny all;
    }

    location ~ ^/(\\.user.ini|\\.htaccess|\\.git|\\.svn|\\.project|LICENSE|README.md) {
        return 404;
    }

    location ~* \\.(gif|jpg|jpeg|png|bmp|swf)$ {
        expires 30d;
        access_log off;
    }

    location ~* \\.(js|css)$ {
        expires 12h;
        access_log off;
    }
}`
      await fs.writeFile(join(flyenvDir, 'conf/vhost.conf'), content)
    }

    const environment: any = {
      ...Nginx.environment
    }

    nginx.volumes = volumes
    nginx.environment = environment
    return {
      nginx
    }
  }
})

export default Nginx
